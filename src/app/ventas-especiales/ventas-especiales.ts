// =============================================================================
// ventas-especiales/ventas-especiales.ts — AGENDAR Y COTIZAR
// =============================================================================
// Pantalla "Ventas especiales". Administrador, encargado y cajero (mismos
// roles que ya cobran en el POS). Dos vistas dentro del mismo componente
// (mismo patrón que recetario.ts/asistencias.ts: una señal decide cuál se
// muestra, los datos ya cargados no se vuelven a pedir al cambiar de vista):
//
//   'lista'   → la agenda: cotizaciones filtradas por fecha/estado/cliente,
//               ordenadas por fecha del evento (la más próxima primero).
//   'detalle' → crear una cotización nueva o editar una existente: datos del
//               cliente/evento + el menú completo para ir agregando
//               productos (categorías/búsqueda, igual criterio de filtrado
//               que ya usa pos.ts) + la lista de lo ya cotizado con su
//               total.
//
// IMPORTANTE: esto NO es una venta real — es una cotización con fecha
// agendada. El precio de cada producto SIEMPRE lo resuelve el servidor
// (routes/ventasEspeciales.js); aquí solo se muestra el precio ya resuelto
// que trae el catálogo, para que el total se vea correcto antes de guardar.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { CatalogoService, Categoria, Producto, Variante } from '../core/catalogo';
import { obtenerEstiloCategoria } from '../pos/categoria-estilos';
import { ThemeService } from '../core/theme';
import {
  VentasEspecialesService,
  VentaEspecialResumen,
  VentaEspecialDetalle,
  TipoVentaEspecial,
  EstadoVentaEspecial,
} from '../core/ventas-especiales';

// Un producto ya agregado a la cotización en construcción, antes de guardar
// (el precio_unitario real lo vuelve a resolver el servidor al guardar; el
// que se guarda aquí es solo para mostrar el total mientras se arma).
//
// `id` es un contador LOCAL (nunca viaja al servidor) — ver
// SIGUIENTE_ID_ITEM: necesario para el `track` del `@for` de esta lista.
// Sin un id estable, trackear por el objeto completo hace que Angular
// recree el nodo del DOM en cada +/-/nota (cada acción reemplaza el objeto
// vía spread) — mismo bug de pérdida de foco ya corregido antes en el
// carrito del POS (ver pos.ts, "Personalización por unidad, no por línea").
interface ItemFormulario {
  id: number;
  variante_id: number;
  productoNombre: string;
  varianteNombre: string;
  precio: number;
  cantidad: number;
  notas: string;
}

let siguienteIdItem = 1;

const TIPOS: { valor: TipoVentaEspecial; etiqueta: string }[] = [
  { valor: 'desayuno', etiqueta: 'Desayuno' },
  { valor: 'comida', etiqueta: 'Comida' },
  { valor: 'sorpresa', etiqueta: 'Sorpresa especial' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const ESTADOS: { valor: EstadoVentaEspecial; etiqueta: string }[] = [
  { valor: 'cotizada', etiqueta: 'Cotizada' },
  { valor: 'confirmada', etiqueta: 'Confirmada' },
  { valor: 'entregada', etiqueta: 'Entregada' },
  { valor: 'cancelada', etiqueta: 'Cancelada' },
];

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que usa todo el
// backend y reportes.ts/nomina.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

@Component({
  selector: 'app-ventas-especiales',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FocoDialogoDirective],
  templateUrl: './ventas-especiales.html',
  styleUrl: './ventas-especiales.css',
})
export class VentasEspecialesComponent implements OnInit {
  readonly tipos = TIPOS;
  readonly estados = ESTADOS;
  estiloCategoria = obtenerEstiloCategoria;

  vista = signal<'lista' | 'detalle'>('lista');

  // ---------------------------------------------------------------------------
  // LISTA (agenda)
  // ---------------------------------------------------------------------------
  lista = signal<VentaEspecialResumen[]>([]);
  cargandoLista = signal(true);
  errorLista = signal('');

  // Por default se ve desde hoy en adelante (una agenda, no un histórico
  // completo) — a diferencia de Mermas/Reportes/Asistencias, donde "sin
  // filtros" es TODO el histórico: aquí lo útil de entrada es "qué viene",
  // no todo lo que ya pasó. "Limpiar filtros" sí vacía la fecha por
  // completo, para ver también las cotizaciones de antes de hoy.
  filtroDesde = signal(formatoFechaLocal(new Date()));
  filtroHasta = signal('');
  filtroEstado = signal<EstadoVentaEspecial | null>(null);
  busqueda = signal('');

  hayFiltros = computed(
    () =>
      !!this.filtroDesde() || !!this.filtroHasta() || !!this.filtroEstado() || !!this.busqueda(),
  );

  private consultaLista?: Subscription;
  private temporizadorBusqueda?: ReturnType<typeof setTimeout>;

  // ---------------------------------------------------------------------------
  // DETALLE (crear/editar)
  // ---------------------------------------------------------------------------
  // null = creando una cotización nueva; con valor = editando esa cotización.
  ventaEditando = signal<VentaEspecialDetalle | null>(null);

  clienteNombreForm = signal('');
  clienteTelefonoForm = signal('');
  clienteDireccionForm = signal('');
  tipoForm = signal<TipoVentaEspecial>('otro');
  fechaEventoForm = signal('');
  horaEventoForm = signal('');
  notasForm = signal('');
  estadoForm = signal<EstadoVentaEspecial>('cotizada');

  itemsForm = signal<ItemFormulario[]>([]);

  guardando = signal(false);
  errorGuardar = signal('');

  // Eliminar (solo al editar una cotización ya guardada, sin importar su
  // estado — se puede borrar lo mismo una "cotizada" que una "cancelada").
  mostrarConfirmarEliminar = signal(false);
  eliminando = signal(false);
  errorEliminarCotizacion = signal('');

  // ---- Catálogo (todos los productos del menú, igual fuente que el POS) ----
  categorias = signal<Categoria[]>([]);
  productos = signal<Producto[]>([]);
  catalogoCargado = signal(false);
  categoriaSeleccionada = signal<number | null>(null);
  busquedaProducto = signal('');
  productoAbierto = signal<Producto | null>(null);

  productosFiltrados = computed(() => {
    const productos = this.productos().filter((p) => p.activo);
    const texto = this.busquedaProducto().trim().toLowerCase();
    if (texto) {
      return productos.filter((p) => p.nombre.toLowerCase().includes(texto));
    }
    const categoriaId = this.categoriaSeleccionada();
    return categoriaId ? productos.filter((p) => p.categoria_id === categoriaId) : productos;
  });

  totalCotizacion = computed(() =>
    this.itemsForm().reduce((suma, item) => suma + item.precio * item.cantidad, 0),
  );

  puedeGuardar = computed(
    () =>
      this.clienteNombreForm().trim().length > 0 &&
      !!this.fechaEventoForm() &&
      this.itemsForm().length > 0,
  );

  // ---- Eliminar historial (2026-10-29): solo administrador, irreversible ----
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');
  mostrarEliminarHistorial = signal(false);
  desdeEliminarHistorial = signal('');
  hastaEliminarHistorial = signal('');
  eliminandoHistorial = signal(false);
  errorEliminarHistorial = signal('');
  resultadoEliminarHistorial = signal<string | null>(null);

  constructor(
    private ventasEspecialesService: VentasEspecialesService,
    private catalogoService: CatalogoService,
    private authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarLista();
  }

  // ---------------------------------------------------------------------------
  // LISTA
  // ---------------------------------------------------------------------------
  cargarLista(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja y lenta no debe pisar el resultado actual
    // (mismo criterio que ya usa reportes.ts/mermas.ts/nomina.ts).
    this.consultaLista?.unsubscribe();
    this.cargandoLista.set(true);
    this.errorLista.set('');

    this.consultaLista = this.ventasEspecialesService
      .listar({
        desde: this.filtroDesde(),
        hasta: this.filtroHasta(),
        estado: this.filtroEstado() ?? undefined,
        buscar: this.busqueda(),
      })
      .subscribe({
        next: (lista) => {
          this.lista.set(lista);
          this.cargandoLista.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorLista.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
              : error.error?.error || 'No se pudo cargar la agenda.',
          );
          this.cargandoLista.set(false);
        },
      });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarLista();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarLista();
  }

  seleccionarEstado(estado: EstadoVentaEspecial | null): void {
    this.filtroEstado.set(estado);
    this.cargarLista();
  }

  // Espera 300 ms sin teclear antes de consultar (mismo criterio que el
  // typeahead de clientes) — no se consulta en cada tecla.
  actualizarBusqueda(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => this.cargarLista(), 300);
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroEstado.set(null);
    this.busqueda.set('');
    this.cargarLista();
  }

  etiquetaTipo(tipo: TipoVentaEspecial): string {
    return this.tipos.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
  }

  etiquetaEstado(estado: EstadoVentaEspecial): string {
    return this.estados.find((e) => e.valor === estado)?.etiqueta ?? estado;
  }

  // ---------------------------------------------------------------------------
  // DETALLE: abrir/cerrar
  // ---------------------------------------------------------------------------
  abrirNuevaCotizacion(): void {
    this.ventaEditando.set(null);
    this.clienteNombreForm.set('');
    this.clienteTelefonoForm.set('');
    this.clienteDireccionForm.set('');
    this.tipoForm.set('otro');
    this.fechaEventoForm.set('');
    this.horaEventoForm.set('');
    this.notasForm.set('');
    this.estadoForm.set('cotizada');
    this.itemsForm.set([]);
    this.errorGuardar.set('');
    this.cargarCatalogoSiHaceFalta();
    this.vista.set('detalle');
  }

  abrirEditarCotizacion(resumen: VentaEspecialResumen): void {
    this.errorGuardar.set('');
    this.cargarCatalogoSiHaceFalta();
    this.vista.set('detalle');
    this.ventasEspecialesService.obtener(resumen.id).subscribe({
      next: (venta) => {
        this.ventaEditando.set(venta);
        this.clienteNombreForm.set(venta.cliente_nombre);
        this.clienteTelefonoForm.set(venta.cliente_telefono ?? '');
        this.clienteDireccionForm.set(venta.cliente_direccion ?? '');
        this.tipoForm.set(venta.tipo);
        this.fechaEventoForm.set(venta.fecha_evento);
        this.horaEventoForm.set(venta.hora_evento?.slice(0, 5) ?? '');
        this.notasForm.set(venta.notas ?? '');
        this.estadoForm.set(venta.estado);
        this.itemsForm.set(
          venta.items.map((item) => ({
            id: siguienteIdItem++,
            variante_id: item.variante_id,
            productoNombre: item.producto_nombre,
            varianteNombre: item.variante_nombre,
            precio: item.precio_unitario,
            cantidad: item.cantidad,
            notas: item.notas ?? '',
          })),
        );
      },
      error: (error: HttpErrorResponse) => {
        this.errorGuardar.set(error.error?.error || 'No se pudo cargar la cotización.');
      },
    });
  }

  volverALista(): void {
    this.vista.set('lista');
    this.cargarLista();
  }

  private cargarCatalogoSiHaceFalta(): void {
    if (this.catalogoCargado()) return;
    this.catalogoService.obtenerCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: () => {
        // Las categorías son solo para los chips de filtro; sin ellas el
        // buscador de productos sigue funcionando igual.
      },
    });
    this.catalogoService.obtenerProductos().subscribe({
      next: (productos) => {
        this.productos.set(productos);
        this.catalogoCargado.set(true);
      },
      error: () => {
        this.errorGuardar.set('No se pudo cargar el menú. Intenta de nuevo.');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // DETALLE: catálogo
  // ---------------------------------------------------------------------------
  seleccionarCategoriaProducto(categoriaId: number | null): void {
    this.categoriaSeleccionada.set(categoriaId);
    this.busquedaProducto.set('');
  }

  actualizarBusquedaProducto(valor: string): void {
    this.busquedaProducto.set(valor);
  }

  abrirSelectorVariante(producto: Producto): void {
    this.productoAbierto.set(producto);
  }

  cerrarSelectorVariante(): void {
    this.productoAbierto.set(null);
  }

  // Si la variante ya estaba en la lista (misma línea exacta, sin notas
  // propias todavía), solo le sube la cantidad en vez de duplicar la fila —
  // mismo criterio de "apilar" que ya usa pos.ts al agregar algo repetido.
  agregarVariante(producto: Producto, variante: Variante): void {
    const existente = this.itemsForm().find(
      (item) => item.variante_id === variante.id && !item.notas,
    );
    if (existente) {
      this.itemsForm.update((items) =>
        items.map((item) =>
          item.id === existente.id ? { ...item, cantidad: item.cantidad + 1 } : item,
        ),
      );
    } else {
      this.itemsForm.update((items) => [
        ...items,
        {
          id: siguienteIdItem++,
          variante_id: variante.id,
          productoNombre: producto.nombre,
          varianteNombre: variante.nombre,
          precio: variante.precio,
          cantidad: 1,
          notas: '',
        },
      ]);
    }
    this.cerrarSelectorVariante();
  }

  // ---------------------------------------------------------------------------
  // DETALLE: productos ya cotizados
  // ---------------------------------------------------------------------------
  incrementarItem(item: ItemFormulario): void {
    this.itemsForm.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i)),
    );
  }

  decrementarItem(item: ItemFormulario): void {
    if (item.cantidad <= 1) {
      this.quitarItem(item);
      return;
    }
    this.itemsForm.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, cantidad: i.cantidad - 1 } : i)),
    );
  }

  actualizarNotaItem(item: ItemFormulario, texto: string): void {
    this.itemsForm.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, notas: texto } : i)),
    );
  }

  quitarItem(item: ItemFormulario): void {
    this.itemsForm.update((items) => items.filter((i) => i.id !== item.id));
  }

  // ---------------------------------------------------------------------------
  // DETALLE: guardar
  // ---------------------------------------------------------------------------
  guardarCotizacion(): void {
    if (!this.puedeGuardar()) return;

    const items = this.itemsForm().map((item) => ({
      variante_id: item.variante_id,
      cantidad: item.cantidad,
      notas: item.notas.trim() || null,
    }));

    this.guardando.set(true);
    this.errorGuardar.set('');

    const payload = {
      cliente_nombre: this.clienteNombreForm().trim(),
      cliente_telefono: this.clienteTelefonoForm().trim() || null,
      cliente_direccion: this.clienteDireccionForm().trim() || null,
      tipo: this.tipoForm(),
      fecha_evento: this.fechaEventoForm(),
      hora_evento: this.horaEventoForm() || null,
      notas: this.notasForm().trim() || null,
      items,
    };

    const ventaActual = this.ventaEditando();
    const peticion = ventaActual
      ? this.ventasEspecialesService.editar(ventaActual.id, {
          ...payload,
          estado: this.estadoForm(),
        })
      : this.ventasEspecialesService.crear(payload);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.volverALista();
      },
      error: (error: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorGuardar.set(error.error?.error || 'No se pudo guardar la cotización.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ---------------------------------------------------------------------------
  // DETALLE: eliminar
  // ---------------------------------------------------------------------------
  abrirConfirmarEliminar(): void {
    this.mostrarConfirmarEliminar.set(true);
    this.errorEliminarCotizacion.set('');
  }

  cerrarConfirmarEliminar(): void {
    if (this.eliminando()) return;
    this.mostrarConfirmarEliminar.set(false);
  }

  confirmarEliminar(): void {
    const venta = this.ventaEditando();
    if (!venta || this.eliminando()) return;

    this.eliminando.set(true);
    this.errorEliminarCotizacion.set('');
    this.ventasEspecialesService.eliminar(venta.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.mostrarConfirmarEliminar.set(false);
        this.volverALista();
      },
      error: (error: HttpErrorResponse) => {
        this.eliminando.set(false);
        this.errorEliminarCotizacion.set(
          error.error?.error || 'No se pudo eliminar la cotización.',
        );
      },
    });
  }

  // ---- Eliminar historial (solo administrador, acción irreversible) -------
  // Borra TODAS las cotizaciones del rango (por fecha_evento), sin importar
  // su estado — a diferencia de eliminar() de arriba (una a la vez).
  abrirEliminarHistorial(): void {
    this.mostrarEliminarHistorial.set(true);
    this.desdeEliminarHistorial.set('');
    this.hastaEliminarHistorial.set('');
    this.errorEliminarHistorial.set('');
    this.resultadoEliminarHistorial.set(null);
  }

  cerrarEliminarHistorial(): void {
    if (this.eliminandoHistorial()) return;
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
    if (!this.puedeEliminarHistorial()) return;
    this.eliminandoHistorial.set(true);
    this.errorEliminarHistorial.set('');
    this.ventasEspecialesService
      .eliminarHistorial(this.desdeEliminarHistorial(), this.hastaEliminarHistorial())
      .subscribe({
        next: (respuesta) => {
          this.eliminandoHistorial.set(false);
          this.resultadoEliminarHistorial.set(
            `Se eliminaron ${respuesta.eliminados} cotización(es) del rango indicado.`,
          );
          this.cargarLista();
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
