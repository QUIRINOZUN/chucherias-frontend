// =============================================================================
// historial-ventas/historial-ventas.ts — CONSULTA DE TICKETS Y CANCELACIÓN (RF-03)
// =============================================================================
// Pantalla "Ventas" (2026-10-22; antes "Ventas de hoy" — ver FILTROS abajo).
// Solo administrador y encargado (información financiera, RNF-03). Muestra:
//   - Filtros de fecha/estado/método de pago/entrega + búsqueda de texto.
//   - El total de las ventas completadas que caen dentro del filtro actual.
//   - Cada venta con sus productos, método de pago, tipo de entrega y estado.
//   - Un botón para cancelar una venta completada, con motivo opcional.
//
// FILTROS (2026-10-22): antes esta pantalla solo mostraba el día del negocio
// en curso (sin ninguna forma de ver un ticket de ayer). Ahora es la consulta
// general de tickets — sin ningún filtro, `GET /api/ventas` ya devuelve TODO
// el histórico (mismo criterio que mermas.ts/ventas-especiales.ts), con un
// rango de fecha opcional (+ accesos rápidos Hoy/Semana/Mes, igual que
// reportes.ts), chips de Estado/Método de pago/Entrega, y una búsqueda de
// texto con debounce de 300 ms (folio, cajero, cliente o producto — ver
// routes/ventas.js). Cada cambio de filtro cancela la consulta anterior si
// todavía no había respondido (mismo patrón `unsubscribe()` que ya usa
// caja.ts/mermas.ts), para que una respuesta vieja y lenta no pise el
// resultado del filtro actual.
//
// FLUJO DE CANCELACIÓN (total o PARCIAL, decisión de negocio del 2026-10-03)
//   1. "Cancelar productos" abre un panel en esa tarjeta (cancelandoId). Por
//      default se seleccionan TODOS los productos activos (cancelación total,
//      el caso más común) — se puede desmarcar alguno para cancelar solo
//      ciertos productos de una venta con varios artículos.
//   2. Si la comanda sigue 'preparando', aparece además un checklist de los
//      insumos que ya se descontaron (SOLO de los productos marcados arriba):
//      cuáles se RESCATAN (vuelven al inventario) y cuáles ya son MERMA de
//      insumo. En 'sin_preparar' nunca se descontó nada (no aplica); en
//      'por_entregar'/'entregado' el producto ya está armado, así que no se
//      ofrece rescate — queda automáticamente como merma total.
//   3. Se escribe el motivo y se confirma. El servidor registra la merma (a
//      nivel producto), la restitución de insumos que corresponda, y —si
//      aplica— un reembolso de caja por lo cancelado. La venta solo pasa a
//      'cancelada' del todo si ya no le queda ningún producto activo.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { EstadoOrden, InsumoDescontado, OrdenesService, TiempoEstadoOrden } from '../core/ordenes';
import { ThemeService } from '../core/theme';
import {
  ItemVentaHistorial,
  MetodoPago,
  TipoEntrega,
  VentaHistorial,
  VentasService,
} from '../core/ventas';

// Etiqueta legible de cada estado para el detalle de tiempos (RF-08); mismos
// nombres que ya usa el tablero de comandas.
const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  sin_preparar: 'Sin preparar',
  preparando: 'Preparando',
  por_entregar: 'Por entregar',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que reportes.ts/
// ventas-especiales.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

@Component({
  selector: 'app-historial-ventas',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FocoDialogoDirective],
  templateUrl: './historial-ventas.html',
  styleUrl: './historial-ventas.css',
})
export class HistorialVentasComponent implements OnInit {
  // Ventas que cumplen el filtro actual, tal como las devolvió el servidor.
  ventas = signal<VentaHistorial[]>([]);
  cargando = signal(true);
  error = signal('');

  // Cada tarjeta nace colapsada mostrando solo orden + total (2026-10-25,
  // pedido directo: con muchos tickets la lista se sentía saturada con todo
  // el detalle siempre visible). "Ver más" la expande; varias pueden estar
  // abiertas a la vez, no es un patrón de "una sola ventana" como el POS.
  ventasExpandidas = signal<Set<number>>(new Set());

  estaExpandida(ventaId: number): boolean {
    return this.ventasExpandidas().has(ventaId);
  }

  alternarExpansion(ventaId: number): void {
    this.ventasExpandidas.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(ventaId)) {
        nuevo.delete(ventaId);
      } else {
        nuevo.add(ventaId);
      }
      return nuevo;
    });
  }

  // ---- Filtros (2026-10-22, ver cabecera del archivo) -----------------------
  // Sin ninguno, se consulta TODO el histórico — mismo criterio que
  // mermas.ts/ventas-especiales.ts.
  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroEstado = signal<'completada' | 'cancelada' | null>(null);
  filtroMetodoPago = signal<MetodoPago | null>(null);
  filtroTipoEntrega = signal<TipoEntrega | null>(null);
  busqueda = signal('');

  hayFiltros = computed(
    () =>
      !!this.filtroDesde() ||
      !!this.filtroHasta() ||
      !!this.filtroEstado() ||
      !!this.filtroMetodoPago() ||
      !!this.filtroTipoEntrega() ||
      !!this.busqueda(),
  );

  private consultaVentas?: Subscription;
  private temporizadorBusqueda?: ReturnType<typeof setTimeout>;

  // id de la venta cuyo panel de cancelación está abierto (null = ninguno).
  cancelandoId = signal<number | null>(null);
  motivoCancelacion = signal('');
  procesandoCancelacion = signal(false);

  // RF-23 (2026-10-16): aviso breve tras cancelar, si esa venta había
  // contado una visita de lealtad que el servidor acaba de revertir.
  avisoLealtadRevertida = signal(false);

  // Qué productos (orden_detalle_id) se van a cancelar; por default todos los
  // activos de la venta (cancelación total). Desmarcar alguno la vuelve parcial.
  lineasACancelar = signal<Set<number>>(new Set());

  // Checklist de insumos a rescatar — solo tiene sentido si la comanda sigue
  // 'preparando' (ver cabecera del archivo). Se recalcula cada vez que cambia
  // la selección de líneas, porque depende de CUÁLES productos se van a cancelar.
  insumosParaRescate = signal<InsumoDescontado[]>([]);
  cargandoInsumosRescate = signal(false);
  insumosRescatados = signal<Set<number>>(new Set());

  // RF-08: detalle de tiempos por estado de UNA orden, abierto a la vez
  // (mismo patrón que el historial de movimientos de inventario.ts).
  tiemposAbiertosOrdenId = signal<number | null>(null);
  tiemposDetalle = signal<TiempoEstadoOrden[]>([]);
  cargandoTiempos = signal(false);

  // Suma de las ventas COMPLETADAS dentro del filtro actual; las canceladas
  // no cuentan, igual que en el corte de caja.
  totalFiltrado = computed(() =>
    this.ventas()
      .filter((v) => v.estado === 'completada')
      .reduce((suma, v) => suma + Number(v.total), 0),
  );

  // Eliminar historial (2026-10-29): acción de alto riesgo, solo administrador
  // — borra TODAS las ventas/órdenes del rango elegido, irreversible.
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');
  mostrarEliminarHistorial = signal(false);
  desdeEliminarHistorial = signal('');
  hastaEliminarHistorial = signal('');
  eliminandoHistorial = signal(false);
  errorEliminarHistorial = signal('');
  resultadoEliminarHistorial = signal<string | null>(null);

  constructor(
    private ventasService: VentasService,
    private ordenesService: OrdenesService,
    public themeService: ThemeService,
    private authService: AuthService,
    private router: Router,
  ) {}

  // Al abrir la pantalla se consulta con los filtros en blanco (todo el histórico).
  ngOnInit(): void {
    this.cargarVentas();
  }

  cargarVentas(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja y lenta no debe pisar el resultado actual
    // (mismo criterio que ya usa caja.ts/mermas.ts con sus filtros de fecha).
    this.consultaVentas?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');
    this.consultaVentas = this.ventasService
      .listar({
        desde: this.filtroDesde(),
        hasta: this.filtroHasta(),
        estado: this.filtroEstado() ?? undefined,
        metodoPago: this.filtroMetodoPago() ?? undefined,
        tipoEntrega: this.filtroTipoEntrega() ?? undefined,
        buscar: this.busqueda(),
      })
      .subscribe({
        next: (ventas) => {
          this.ventas.set(ventas);
          this.cargando.set(false);
        },
        error: (error: HttpErrorResponse) => {
          // status 0 = sin respuesta (sin Internet o servidor gratuito dormido).
          this.error.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
              : error.error?.error || 'No se pudieron cargar las ventas.',
          );
          this.cargando.set(false);
        },
      });
  }

  // ---- Manejadores de los filtros (ver cabecera del archivo) ----------------
  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarVentas();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarVentas();
  }

  seleccionarEstado(estado: 'completada' | 'cancelada' | null): void {
    this.filtroEstado.set(estado);
    this.cargarVentas();
  }

  seleccionarMetodoPago(metodo: MetodoPago | null): void {
    this.filtroMetodoPago.set(metodo);
    this.cargarVentas();
  }

  seleccionarTipoEntrega(tipo: TipoEntrega | null): void {
    this.filtroTipoEntrega.set(tipo);
    this.cargarVentas();
  }

  // Espera 300 ms sin teclear antes de consultar (mismo criterio que el
  // typeahead de clientes/ventas-especiales) — no se consulta en cada tecla.
  actualizarBusqueda(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => this.cargarVentas(), 300);
  }

  // Accesos rápidos de periodo (mismo patrón que reportes.ts).
  seleccionarHoy(): void {
    const hoy = formatoFechaLocal(new Date());
    this.filtroDesde.set(hoy);
    this.filtroHasta.set(hoy);
    this.cargarVentas();
  }

  seleccionarSemana(): void {
    const hoy = new Date();
    // Lunes de esta semana: getDay() da 0=domingo..6=sábado; se retrocede al
    // lunes más reciente (domingo retrocede 6 días, no 1).
    const diasDesdeElLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeElLunes);
    this.filtroDesde.set(formatoFechaLocal(lunes));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarVentas();
  }

  seleccionarMes(): void {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.filtroDesde.set(formatoFechaLocal(primerDia));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarVentas();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroEstado.set(null);
    this.filtroMetodoPago.set(null);
    this.filtroTipoEntrega.set(null);
    this.busqueda.set('');
    this.cargarVentas();
  }

  // Productos de una venta que todavía se pueden cancelar (no cancelados ya).
  lineasActivas(venta: VentaHistorial): ItemVentaHistorial[] {
    return venta.items.filter((i) => !i.cancelado);
  }

  // Abre el panel de cancelación: por default se seleccionan TODOS los
  // productos activos (cancelación total, el caso más común).
  abrirCancelacion(venta: VentaHistorial): void {
    this.cancelandoId.set(venta.id);
    this.motivoCancelacion.set('');
    this.lineasACancelar.set(new Set(this.lineasActivas(venta).map((i) => i.orden_detalle_id)));
    this.insumosRescatados.set(new Set());
    this.cargarInsumosParaRescate(venta);
  }

  // Cierra el panel sin cancelar nada ("Volver").
  cerrarCancelacion(): void {
    this.cancelandoId.set(null);
    this.insumosParaRescate.set([]);
  }

  // Marca/desmarca un producto para cancelar. Si la comanda sigue
  // 'preparando', el checklist de insumos se recalcula para la nueva
  // selección (cambiar qué se cancela cambia qué insumos entran en juego).
  alternarLinea(venta: VentaHistorial, ordenDetalleId: number): void {
    this.lineasACancelar.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(ordenDetalleId)) {
        nuevo.delete(ordenDetalleId);
      } else {
        nuevo.add(ordenDetalleId);
      }
      return nuevo;
    });
    this.insumosRescatados.set(new Set());
    this.cargarInsumosParaRescate(venta);
  }

  // Marca/desmarca un insumo como "se rescata" dentro del checklist.
  alternarInsumoRescate(insumoId: number): void {
    this.insumosRescatados.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(insumoId)) {
        nuevo.delete(insumoId);
      } else {
        nuevo.add(insumoId);
      }
      return nuevo;
    });
  }

  // Solo si la comanda sigue 'preparando' tiene sentido preguntar qué
  // insumos se rescatan — en cualquier otro estado no se descontó nada
  // (sin_preparar) o ya no se puede rescatar nada (por_entregar/entregado).
  private cargarInsumosParaRescate(venta: VentaHistorial): void {
    if (venta.estado_orden !== 'preparando' || this.lineasACancelar().size === 0) {
      this.insumosParaRescate.set([]);
      return;
    }
    this.cargandoInsumosRescate.set(true);
    this.ordenesService
      .obtenerInsumosDescontados(venta.orden_id, [...this.lineasACancelar()])
      .subscribe({
        next: (insumos) => {
          this.insumosParaRescate.set(insumos);
          this.cargandoInsumosRescate.set(false);
        },
        error: () => {
          this.insumosParaRescate.set([]);
          this.cargandoInsumosRescate.set(false);
        },
      });
  }

  puedeConfirmarCancelacion(): boolean {
    return this.lineasACancelar().size > 0 && !this.procesandoCancelacion();
  }

  // Envía la cancelación al servidor y, si sale bien, recarga la lista para
  // que la venta (o solo los productos elegidos) aparezca como cancelada,
  // con su auditoría, merma, restitución y reembolso ya reflejados.
  confirmarCancelacion(venta: VentaHistorial): void {
    if (!this.puedeConfirmarCancelacion()) {
      return;
    }
    this.procesandoCancelacion.set(true);
    this.ventasService
      .cancelar(
        venta.id,
        this.motivoCancelacion().trim(),
        [...this.lineasACancelar()],
        [...this.insumosRescatados()],
      )
      .subscribe({
        next: (respuesta) => {
          this.procesandoCancelacion.set(false);
          this.cancelandoId.set(null);
          this.insumosParaRescate.set([]);
          this.avisoLealtadRevertida.set(respuesta.lealtad_revertida);
          this.cargarVentas();
        },
        error: (error: HttpErrorResponse) => {
          this.procesandoCancelacion.set(false);
          this.error.set(error.error?.error || 'No se pudo cancelar la venta.');
        },
      });
  }

  cerrarAvisoLealtad(): void {
    this.avisoLealtadRevertida.set(false);
  }

  // RF-08: expande/colapsa el detalle de tiempos por estado de una venta
  // (consulta bajo demanda, igual que el historial de movimientos de
  // inventario.ts — no se carga para las 50 ventas del día de una sola vez).
  alternarTiempos(venta: VentaHistorial): void {
    if (this.tiemposAbiertosOrdenId() === venta.orden_id) {
      this.tiemposAbiertosOrdenId.set(null);
      return;
    }
    this.tiemposAbiertosOrdenId.set(venta.orden_id);
    this.cargandoTiempos.set(true);
    this.ordenesService.obtenerTiempos(venta.orden_id).subscribe({
      next: (tiempos) => {
        this.tiemposDetalle.set(tiempos);
        this.cargandoTiempos.set(false);
      },
      error: () => {
        this.tiemposDetalle.set([]);
        this.cargandoTiempos.set(false);
      },
    });
  }

  // Formatea segundos como "Xm Ys" (o solo "Ys" si dura menos de un minuto),
  // para los badges y el detalle de tiempos.
  formatoDuracion(segundos: number): string {
    const minutos = Math.floor(segundos / 60);
    const resto = segundos % 60;
    return minutos > 0 ? `${minutos}m ${resto}s` : `${resto}s`;
  }

  etiquetaEstado(estado: EstadoOrden): string {
    return ETIQUETA_ESTADO[estado] ?? estado;
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ---- Eliminar historial (solo administrador, acción irreversible) -------
  abrirEliminarHistorial(): void {
    this.mostrarEliminarHistorial.set(true);
    this.desdeEliminarHistorial.set('');
    this.hastaEliminarHistorial.set('');
    this.errorEliminarHistorial.set('');
    this.resultadoEliminarHistorial.set(null);
  }

  cerrarEliminarHistorial(): void {
    if (this.eliminandoHistorial()) {
      return;
    }
    this.mostrarEliminarHistorial.set(false);
  }

  puedeEliminarHistorial(): boolean {
    return (
      !!this.desdeEliminarHistorial() &&
      !!this.hastaEliminarHistorial() &&
      this.hastaEliminarHistorial() >= this.desdeEliminarHistorial() &&
      !this.eliminandoHistorial()
    );
  }

  confirmarEliminarHistorial(): void {
    if (!this.puedeEliminarHistorial()) {
      return;
    }
    this.eliminandoHistorial.set(true);
    this.errorEliminarHistorial.set('');
    this.ventasService
      .eliminarHistorial(this.desdeEliminarHistorial(), this.hastaEliminarHistorial())
      .subscribe({
        next: (respuesta) => {
          this.eliminandoHistorial.set(false);
          this.resultadoEliminarHistorial.set(
            `Se eliminaron ${respuesta.eliminados} venta(s) del rango indicado.`,
          );
          this.cargarVentas();
        },
        error: (error: HttpErrorResponse) => {
          this.eliminandoHistorial.set(false);
          this.errorEliminarHistorial.set(
            error.error?.error || 'No se pudo eliminar el historial.',
          );
        },
      });
  }
}
