// =============================================================================
// historial-ventas/historial-ventas.ts — VENTAS DEL DÍA Y CANCELACIÓN (RF-03)
// =============================================================================
// Pantalla "Ventas de hoy". Solo administrador y encargado (información
// financiera, RNF-03). Muestra:
//   - El total del día (solo ventas completadas).
//   - Cada venta con sus productos, método de pago, tipo de entrega y estado.
//   - Un botón para cancelar una venta completada, con motivo opcional.
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
import { Router } from '@angular/router';
import { EstadoOrden, InsumoDescontado, OrdenesService, TiempoEstadoOrden } from '../core/ordenes';
import { ThemeService } from '../core/theme';
import { ItemVentaHistorial, VentaHistorial, VentasService } from '../core/ventas';

// Etiqueta legible de cada estado para el detalle de tiempos (RF-08); mismos
// nombres que ya usa el tablero de comandas.
const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  sin_preparar: 'Sin preparar',
  preparando: 'Preparando',
  por_entregar: 'Por entregar',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

@Component({
  selector: 'app-historial-ventas',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './historial-ventas.html',
  styleUrl: './historial-ventas.css',
})
export class HistorialVentasComponent implements OnInit {
  // Ventas del día tal como las devolvió el servidor.
  ventas = signal<VentaHistorial[]>([]);
  cargando = signal(true);
  error = signal('');

  // id de la venta cuyo panel de cancelación está abierto (null = ninguno).
  cancelandoId = signal<number | null>(null);
  motivoCancelacion = signal('');
  procesandoCancelacion = signal(false);

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

  // Suma de las ventas COMPLETADAS; las canceladas no cuentan, igual que en el
  // corte de caja.
  totalDelDia = computed(() =>
    this.ventas()
      .filter((v) => v.estado === 'completada')
      .reduce((suma, v) => suma + Number(v.total), 0),
  );

  constructor(
    private ventasService: VentasService,
    private ordenesService: OrdenesService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  // Al abrir la pantalla se cargan las ventas de hoy.
  ngOnInit(): void {
    this.cargarVentas();
  }

  cargarVentas(): void {
    this.cargando.set(true);
    this.ventasService.listar().subscribe({
      next: (ventas) => {
        this.ventas.set(ventas);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        // status 0 = sin respuesta (sin Internet o servidor gratuito dormido).
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : 'No se pudieron cargar las ventas.',
        );
        this.cargando.set(false);
      },
    });
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
        next: () => {
          this.procesandoCancelacion.set(false);
          this.cancelandoId.set(null);
          this.insumosParaRescate.set([]);
          this.cargarVentas();
        },
        error: (error: HttpErrorResponse) => {
          this.procesandoCancelacion.set(false);
          this.error.set(error.error?.error || 'No se pudo cancelar la venta.');
        },
      });
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
}
