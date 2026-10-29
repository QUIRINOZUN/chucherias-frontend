// =============================================================================
// gastos/gastos.ts — GASTOS GENERALES DEL NEGOCIO (2026-10-28)
// =============================================================================
// Pantalla "Gastos". Solo administrador y encargado (información financiera,
// RNF-03 — mismo criterio que insumos/caja/nómina/reportes). Renta,
// servicios, mantenimiento, compras no ligadas a una venta ni a un insumo de
// receta — deliberadamente AISLADO de caja/corte diario (ver
// routes/gastos.js para el detalle completo de la decisión de alcance). Un
// filtro de fecha opcional (desde/hasta, con los mismos accesos rápidos
// Hoy/Esta semana/Este mes que ya usa Reportes/Nómina) + chips de categoría
// y forma de pago (server-filtrados, igual criterio que Ventas — sin
// conteo junto al chip, a diferencia de Inventario, porque aquí la lista
// completa no vive en el cliente) + búsqueda por concepto/nota.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import {
  GastosService,
  Gasto,
  CategoriaGasto,
  FormaPagoGasto,
  FiltrosGastos,
} from '../core/gastos';
import { ProveedoresService, Proveedor } from '../core/proveedores';
import { ThemeService } from '../core/theme';

type ModoFormulario = 'crear' | 'editar' | null;

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que usa todo el
// backend y reportes.ts/nomina.ts/historial-ventas.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FocoDialogoDirective],
  templateUrl: './gastos.html',
  styleUrl: './gastos.css',
})
export class GastosComponent implements OnInit {
  categorias = signal<CategoriaGasto[]>([]);
  proveedores = signal<Proveedor[]>([]);

  gastos = signal<Gasto[]>([]);
  cargando = signal(true);
  error = signal('');

  // ---- Filtros ----
  filtroDesde = signal('');
  filtroHasta = signal('');
  categoriaFiltroId = signal<number | null>(null);
  formaPagoFiltro = signal<FormaPagoGasto | null>(null);
  busqueda = signal('');

  hayFiltros = computed(
    () =>
      !!this.filtroDesde() ||
      !!this.filtroHasta() ||
      this.categoriaFiltroId() !== null ||
      !!this.formaPagoFiltro() ||
      !!this.busqueda(),
  );

  private consultaGastos?: Subscription;
  private temporizadorBusqueda?: ReturnType<typeof setTimeout>;

  // ---- Totales del periodo (sumas simples sobre lo que ya trajo el
  // servidor con los filtros actuales — nunca se recalcula ningún gasto en
  // el cliente). Number(...) es necesario: `monto` viene de una columna
  // NUMERIC en Postgres, que el driver `pg` siempre entrega como STRING
  // (mismo motivo ya documentado en nomina.ts — sin la conversión, sumar
  // con `+` concatena en vez de sumar). ----
  totalPeriodo = computed(() => this.gastos().reduce((suma, g) => suma + Number(g.monto), 0));
  cantidadGastos = computed(() => this.gastos().length);
  totalRecurrente = computed(() =>
    this.gastos()
      .filter((g) => g.es_recurrente)
      .reduce((suma, g) => suma + Number(g.monto), 0),
  );
  cantidadRecurrentes = computed(() => this.gastos().filter((g) => g.es_recurrente).length);

  // ---- Ventana de crear/editar ----
  modoFormulario = signal<ModoFormulario>(null);
  gastoEditandoId = signal<number | null>(null);

  categoriaIdForm = signal<number | null>(null);
  conceptoForm = signal('');
  montoForm = signal<number | null>(null);
  fechaForm = signal('');
  formaPagoForm = signal<FormaPagoGasto>('efectivo');
  esRecurrenteForm = signal(false);
  proveedorIdForm = signal<number | null>(null);
  notaForm = signal('');

  mostrarNuevaCategoria = signal(false);
  nombreCategoriaForm = signal('');
  procesandoCategoria = signal(false);

  mostrarNuevoProveedor = signal(false);
  nombreProveedorForm = signal('');
  procesandoProveedor = signal(false);

  guardando = signal(false);
  errorForm = signal('');

  puedeGuardar = computed(
    () =>
      this.categoriaIdForm() !== null &&
      this.conceptoForm().trim().length > 0 &&
      (this.montoForm() ?? 0) > 0 &&
      !!this.fechaForm() &&
      !!this.formaPagoForm(),
  );

  // ---- Confirmar eliminar ----
  gastoAEliminar = signal<Gasto | null>(null);
  eliminando = signal(false);
  errorEliminar = signal('');

  constructor(
    private gastosService: GastosService,
    private proveedoresService: ProveedoresService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.gastosService.listarCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: () => {
        // El selector de categoría del formulario simplemente queda vacío;
        // el resto de la pantalla sigue funcionando.
      },
    });
    this.proveedoresService.listar().subscribe({
      next: (proveedores) => this.proveedores.set(proveedores),
      error: () => {
        // El selector de proveedor del formulario simplemente queda vacío.
      },
    });
    this.cargarGastos();
  }

  cargarGastos(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja y lenta no debe pisar el resultado actual
    // (mismo criterio que ya usa reportes.ts/mermas.ts/nomina.ts).
    this.consultaGastos?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');

    const filtros: FiltrosGastos = {
      desde: this.filtroDesde() || undefined,
      hasta: this.filtroHasta() || undefined,
      categoria_id: this.categoriaFiltroId() ?? undefined,
      forma_pago: this.formaPagoFiltro() ?? undefined,
      buscar: this.busqueda() || undefined,
    };

    this.consultaGastos = this.gastosService.listar(filtros).subscribe({
      next: (gastos) => {
        this.gastos.set(gastos);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : error.error?.error || 'No se pudieron cargar los gastos.',
        );
        this.cargando.set(false);
      },
    });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarGastos();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarGastos();
  }

  seleccionarCategoriaFiltro(id: number | null): void {
    this.categoriaFiltroId.set(id);
    this.cargarGastos();
  }

  seleccionarFormaPagoFiltro(forma: FormaPagoGasto | null): void {
    this.formaPagoFiltro.set(forma);
    this.cargarGastos();
  }

  // Espera 300 ms sin teclear antes de consultar (mismo criterio que el
  // buscador de Ventas/Ventas especiales) — no se consulta en cada tecla.
  actualizarBusqueda(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => this.cargarGastos(), 300);
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.categoriaFiltroId.set(null);
    this.formaPagoFiltro.set(null);
    this.busqueda.set('');
    this.cargarGastos();
  }

  // Mismos accesos rápidos que ya tienen Reportes/Nómina/Ventas.
  seleccionarHoy(): void {
    const hoy = formatoFechaLocal(new Date());
    this.filtroDesde.set(hoy);
    this.filtroHasta.set(hoy);
    this.cargarGastos();
  }

  seleccionarSemana(): void {
    const hoy = new Date();
    const diasDesdeElLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeElLunes);
    this.filtroDesde.set(formatoFechaLocal(lunes));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarGastos();
  }

  seleccionarMes(): void {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.filtroDesde.set(formatoFechaLocal(primerDia));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarGastos();
  }

  // ---------------------------------------------------------------------------
  // Crear / editar
  // ---------------------------------------------------------------------------
  abrirCreacion(): void {
    this.modoFormulario.set('crear');
    this.gastoEditandoId.set(null);
    this.categoriaIdForm.set(null);
    this.conceptoForm.set('');
    this.montoForm.set(null);
    this.fechaForm.set(formatoFechaLocal(new Date()));
    this.formaPagoForm.set('efectivo');
    this.esRecurrenteForm.set(false);
    this.proveedorIdForm.set(null);
    this.notaForm.set('');
    this.errorForm.set('');
    this.mostrarNuevaCategoria.set(false);
    this.mostrarNuevoProveedor.set(false);
  }

  abrirEdicion(gasto: Gasto): void {
    this.modoFormulario.set('editar');
    this.gastoEditandoId.set(gasto.id);
    this.categoriaIdForm.set(gasto.categoria_id);
    this.conceptoForm.set(gasto.concepto);
    this.montoForm.set(Number(gasto.monto));
    this.fechaForm.set(gasto.fecha);
    this.formaPagoForm.set(gasto.forma_pago);
    this.esRecurrenteForm.set(gasto.es_recurrente);
    this.proveedorIdForm.set(gasto.proveedor_id);
    this.notaForm.set(gasto.nota ?? '');
    this.errorForm.set('');
    this.mostrarNuevaCategoria.set(false);
    this.mostrarNuevoProveedor.set(false);
  }

  cerrarFormulario(): void {
    if (this.guardando()) return;
    this.modoFormulario.set(null);
  }

  guardar(): void {
    if (!this.puedeGuardar() || this.guardando()) return;

    const datos = {
      categoria_id: this.categoriaIdForm()!,
      concepto: this.conceptoForm().trim(),
      monto: this.montoForm()!,
      fecha: this.fechaForm(),
      forma_pago: this.formaPagoForm(),
      es_recurrente: this.esRecurrenteForm(),
      proveedor_id: this.proveedorIdForm(),
      nota: this.notaForm().trim() || null,
    };

    this.guardando.set(true);
    this.errorForm.set('');

    const peticion =
      this.modoFormulario() === 'editar'
        ? this.gastosService.editar(this.gastoEditandoId()!, datos)
        : this.gastosService.crear(datos);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modoFormulario.set(null);
        this.cargarGastos();
      },
      error: (error: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorForm.set(error.error?.error || 'No se pudo guardar el gasto.');
      },
    });
  }

  // Alta rápida de categoría sin salir del formulario — mismo patrón que
  // crearCategoriaRapida() en inventario.ts: la agrega al catálogo y la
  // deja preseleccionada.
  crearCategoriaRapida(): void {
    const nombre = this.nombreCategoriaForm().trim();
    if (!nombre || this.procesandoCategoria()) return;
    this.procesandoCategoria.set(true);
    this.gastosService.crearCategoria(nombre).subscribe({
      next: (categoria) => {
        this.procesandoCategoria.set(false);
        this.categorias.update((lista) =>
          [...lista, categoria].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        );
        this.categoriaIdForm.set(categoria.id);
        this.mostrarNuevaCategoria.set(false);
        this.nombreCategoriaForm.set('');
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoCategoria.set(false);
        this.errorForm.set(error.error?.error || 'No se pudo crear la categoría.');
      },
    });
  }

  // Alta rápida de proveedor sin salir del formulario — mismo patrón que
  // crearProveedorRapido() en inventario.ts.
  crearProveedorRapido(): void {
    const nombre = this.nombreProveedorForm().trim();
    if (!nombre || this.procesandoProveedor()) return;
    this.procesandoProveedor.set(true);
    this.proveedoresService.crear({ nombre }).subscribe({
      next: (proveedor) => {
        this.procesandoProveedor.set(false);
        this.proveedores.update((lista) =>
          [...lista, proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        );
        this.proveedorIdForm.set(proveedor.id);
        this.mostrarNuevoProveedor.set(false);
        this.nombreProveedorForm.set('');
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoProveedor.set(false);
        this.errorForm.set(error.error?.error || 'No se pudo crear el proveedor.');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Eliminar
  // ---------------------------------------------------------------------------
  abrirConfirmarEliminar(gasto: Gasto): void {
    this.gastoAEliminar.set(gasto);
    this.errorEliminar.set('');
  }

  cerrarConfirmarEliminar(): void {
    if (this.eliminando()) return;
    this.gastoAEliminar.set(null);
  }

  confirmarEliminar(): void {
    const gasto = this.gastoAEliminar();
    if (!gasto) return;
    this.eliminando.set(true);
    this.errorEliminar.set('');
    this.gastosService.eliminar(gasto.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.gastoAEliminar.set(null);
        this.cargarGastos();
      },
      error: (error: HttpErrorResponse) => {
        this.eliminando.set(false);
        this.errorEliminar.set(error.error?.error || 'No se pudo eliminar el gasto.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
