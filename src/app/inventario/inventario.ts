// =============================================================================
// inventario/inventario.ts — INVENTARIO DE INSUMOS
// =============================================================================
// Pantalla "Inventario". Solo administrador y encargado (rolGuard en
// app.routes.ts, y el servidor lo vuelve a exigir en routes/insumos.js).
//
// QUÉ HACE
//   - Lista los insumos con su existencia calculada por el servidor (suma de
//     movimientos_inventario: entrada + ajuste − salida − merma) y resalta
//     los que están en o por debajo de su cantidad_minima.
//   - La lista va agrupada por categoría de insumo (proteínas, lácteos,
//     salsas, etc. — catálogo de `categorias_insumo`, separado del de
//     categorías del MENÚ): 138 insumos en una sola lista plana era difícil
//     de navegar. Cada sección se puede colapsar; chips arriba de la lista
//     filtran por categoría (mutuamente excluyente con la búsqueda de texto,
//     igual que en el POS: buscar limpia el filtro de categoría en la
//     práctica, y elegir un chip limpia la búsqueda).
//   - Layout en dos columnas a partir de 860px (inventario.css): controles
//     (alta, buscador, chips) a la izquierda y fijos al hacer scroll; lista
//     a la derecha. En móvil se apilan en el mismo orden.
//   - Un formulario (ventana emergente) sirve para CREAR y EDITAR insumos,
//     igual que el patrón de usuarios/usuarios.ts (modoFormulario decide el
//     endpoint). Incluye alta rápida de proveedor Y de categoría sin salir
//     del formulario (2026-10-08).
//   - Filtro de proveedor en chips (2026-10-08), eje independiente igual que
//     el de nivel de stock: se combina con búsqueda/categoría/nivel en vez
//     de limpiarlos.
//   - Cada tarjeta muestra un indicador de color de su nivel de stock
//     (bajo/medio/alto) junto a la existencia — mismos colores que sus
//     chips de filtro, para reconocerlo de un vistazo sin leer el número.
//   - Otra ventana emergente registra un movimiento manual: "Entrada"
//     (mercancía recibida) o "Ajuste" (corrección de conteo, con motivo
//     obligatorio). La "salida" es automática: la genera routes/ordenes.js al
//     avanzar una comanda a 'preparando' (descuento por receta) — no se
//     registra a mano.
//   - Cada fila se puede expandir para ver su historial de movimientos.
//   - La ventana de movimiento permite capturar la cantidad en una unidad
//     "de compra" (kg/L) distinta a la unidad "de consumo" del insumo
//     (g/ml, la que usa la receta): se convierte antes de enviarla al
//     servidor (ver opcionesSurtido) — la unidad de consumo NUNCA cambia.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ThemeService } from '../core/theme';
import {
  CategoriaInsumo,
  DatosInsumo,
  Insumo,
  InsumosService,
  MovimientoInventario,
} from '../core/insumos';
import { Proveedor, ProveedoresService } from '../core/proveedores';

type ModoFormularioInsumo = 'crear' | 'editar' | null;
type TipoMovimiento = 'entrada' | 'ajuste' | 'merma' | null;
type NivelStock = 'bajo' | 'medio' | 'alto';

// Clave de agrupación para insumos sin categoria_id (NULL en la base): un id
// real nunca es negativo, así que -1 no puede chocar con ninguna categoría.
const SIN_CATEGORIA_ID = -1;
// Mismo truco para el filtro de proveedor: -1 representa "sin proveedor".
const SIN_PROVEEDOR_ID = -1;

// Clasifica la existencia de un insumo relativa a su propio mínimo (no hay
// un "máximo" capturado en ningún lado, así que se usa el mínimo como única
// referencia): bajo = ya en alerta (existencia <= mínimo, igual que
// `insumo.alerta`); alto = el doble del mínimo o más; medio = lo que queda
// en medio. Si el mínimo todavía está en 0 (la mayoría de los 138 insumos
// reales — ver nota en CLAUDE.md), "medio" queda vacío a propósito (0 <
// existencia <= 0 nunca se cumple): sin un mínimo real capturado no hay con
// qué distinguir "medio" de "alto", así que todo lo que no sea bajo cae en
// alto.
function nivelStock(insumo: Insumo): NivelStock {
  if (insumo.existencia <= insumo.cantidad_minima) {
    return 'bajo';
  }
  if (insumo.existencia <= insumo.cantidad_minima * 2) {
    return 'medio';
  }
  return 'alto';
}

// Una sección de la lista: todos los insumos de una misma categoría.
interface GrupoInsumos {
  id: number;
  nombre: string;
  insumos: Insumo[];
}

// Una unidad en la que se puede CAPTURAR un movimiento (entrada/ajuste),
// distinta de la unidad de CONSUMO del insumo (la de la receta, que nunca
// cambia). `factor` convierte de esta unidad a la unidad base del insumo:
// cantidad_base = cantidad_capturada * factor.
interface OpcionUnidadSurtido {
  valor: string;
  etiqueta: string;
  factor: number;
}

// No compramos cebolla en gramos, sino en kilos: para insumos en gramos o
// mililitros se ofrece también su unidad "grande" (kg/L) para capturar el
// movimiento; se convierte a la unidad base (g/ml, la que usa la receta)
// antes de mandarla al servidor. El resto de unidades no tiene una
// conversión natural, así que solo se ofrecen a sí mismas.
function opcionesSurtido(unidadBase: string): OpcionUnidadSurtido[] {
  if (unidadBase === 'g') {
    return [
      { valor: 'g', etiqueta: 'g', factor: 1 },
      { valor: 'kg', etiqueta: 'kg', factor: 1000 },
    ];
  }
  if (unidadBase === 'ml') {
    return [
      { valor: 'ml', etiqueta: 'ml', factor: 1 },
      { valor: 'l', etiqueta: 'L', factor: 1000 },
    ];
  }
  return [{ valor: unidadBase, etiqueta: unidadBase, factor: 1 }];
}

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './inventario.html',
  styleUrl: './inventario.css',
})
export class InventarioComponent implements OnInit {
  insumos = signal<Insumo[]>([]);
  proveedores = signal<Proveedor[]>([]);
  categorias = signal<CategoriaInsumo[]>([]);
  cargando = signal(true);
  error = signal('');
  busqueda = signal('');

  // Categoría elegida en los chips de arriba de la lista (null = "Todas").
  // Igual que en el POS, buscar por texto y filtrar por categoría son
  // mutuamente excluyentes: mientras hay texto, la búsqueda ignora el chip
  // activo y mira todo el catálogo; elegir un chip limpia la búsqueda.
  categoriaFiltroId = signal<number | null>(null);

  // Nivel de stock elegido en sus propios chips ("Todos" / Bajo / Medio /
  // Alto — ver nivelStock arriba). A diferencia de la categoría, este filtro
  // es un eje INDEPENDIENTE: se combina con la búsqueda o la categoría activa
  // en vez de limpiarlas, porque responde una pregunta distinta ("¿cuáles
  // están bajos?") que tiene sentido dentro de cualquier categoría o búsqueda.
  nivelStockFiltro = signal<NivelStock | null>(null);

  // Proveedor elegido en sus propios chips (2026-10-08) — igual que el nivel
  // de stock, es un eje INDEPENDIENTE: se combina con la búsqueda, la
  // categoría o el nivel en vez de limpiarlos ("¿qué tengo de este
  // proveedor en la categoría X?" es una pregunta válida). SIN_PROVEEDOR_ID
  // filtra los insumos sin proveedor asignado.
  proveedorFiltroId = signal<number | null>(null);

  // Categorías colapsadas (por id; SIN_CATEGORIA_ID para el grupo "Sin
  // categoría"). Ninguna colapsada por default: todo visible al entrar.
  categoriasColapsadas = signal<Set<number>>(new Set());

  // Insumos visibles según la búsqueda/categoría; los que tienen alerta van
  // primero dentro de cada grupo para que salten a la vista sin buscarlos.
  insumosVisibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    let lista = this.insumos();
    if (texto) {
      lista = lista.filter((i) => i.nombre.toLowerCase().includes(texto));
    } else if (this.categoriaFiltroId() != null) {
      lista = lista.filter(
        (i) => (i.categoria_id ?? SIN_CATEGORIA_ID) === this.categoriaFiltroId(),
      );
    }
    const nivel = this.nivelStockFiltro();
    if (nivel) {
      lista = lista.filter((i) => nivelStock(i) === nivel);
    }
    const proveedorId = this.proveedorFiltroId();
    if (proveedorId != null) {
      lista = lista.filter((i) => (i.proveedor_id ?? SIN_PROVEEDOR_ID) === proveedorId);
    }
    return [...lista].sort((a, b) => Number(b.alerta) - Number(a.alerta));
  });

  // Nivel de stock de un insumo, expuesto para la plantilla (el indicador de
  // color en cada tarjeta) — reutiliza la misma clasificación que ya usan
  // los chips de nivel, así el color de la tarjeta siempre coincide con el
  // chip que la filtraría.
  nivelDe(insumo: Insumo): NivelStock {
    return nivelStock(insumo);
  }

  // La lista, ya agrupada por categoría en el mismo orden en que existen las
  // categorías (de cocina a mostrador); "Sin categoría" queda al final.
  gruposVisibles = computed<GrupoInsumos[]>(() => {
    const porCategoria = new Map<number, Insumo[]>();
    for (const insumo of this.insumosVisibles()) {
      const clave = insumo.categoria_id ?? SIN_CATEGORIA_ID;
      if (!porCategoria.has(clave)) {
        porCategoria.set(clave, []);
      }
      porCategoria.get(clave)!.push(insumo);
    }

    const grupos: GrupoInsumos[] = this.categorias()
      .filter((c) => porCategoria.has(c.id))
      .map((c) => ({ id: c.id, nombre: c.nombre, insumos: porCategoria.get(c.id)! }));

    if (porCategoria.has(SIN_CATEGORIA_ID)) {
      grupos.push({
        id: SIN_CATEGORIA_ID,
        nombre: 'Sin categoría',
        insumos: porCategoria.get(SIN_CATEGORIA_ID)!,
      });
    }
    return grupos;
  });

  cantidadAlertas = computed(() => this.insumos().filter((i) => i.alerta).length);

  // Cuántos insumos tiene cada categoría en total (sin filtrar), para el
  // número junto a cada chip.
  private conteoPorCategoria = computed(() => {
    const mapa = new Map<number, number>();
    for (const insumo of this.insumos()) {
      const clave = insumo.categoria_id ?? SIN_CATEGORIA_ID;
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  });

  contarCategoria(id: number | null): number {
    return id === null ? this.insumos().length : (this.conteoPorCategoria().get(id) ?? 0);
  }

  seleccionarCategoria(id: number | null): void {
    this.categoriaFiltroId.set(id);
    this.busqueda.set('');
  }

  // Cuántos insumos hay en cada nivel de stock, SIN aplicar el resto de los
  // filtros (mismo criterio que contarCategoria: el número junto al chip
  // siempre refleja el total real, no lo que ya está filtrado).
  private conteoPorNivel = computed(() => {
    const mapa = new Map<NivelStock, number>();
    for (const insumo of this.insumos()) {
      const nivel = nivelStock(insumo);
      mapa.set(nivel, (mapa.get(nivel) ?? 0) + 1);
    }
    return mapa;
  });

  contarNivel(nivel: NivelStock | null): number {
    return nivel === null ? this.insumos().length : (this.conteoPorNivel().get(nivel) ?? 0);
  }

  // A diferencia de seleccionarCategoria, elegir el mismo nivel otra vez lo
  // apaga (toggle): es un filtro secundario, no hay un estado "sin elegir"
  // separado del "Todos" explícito en los chips.
  seleccionarNivel(nivel: NivelStock | null): void {
    this.nivelStockFiltro.set(this.nivelStockFiltro() === nivel ? null : nivel);
  }

  // Cuántos insumos tiene cada proveedor en total (sin filtrar), mismo
  // criterio que conteoPorCategoria/conteoPorNivel.
  private conteoPorProveedor = computed(() => {
    const mapa = new Map<number, number>();
    for (const insumo of this.insumos()) {
      const clave = insumo.proveedor_id ?? SIN_PROVEEDOR_ID;
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  });

  contarProveedor(id: number | null): number {
    return id === null ? this.insumos().length : (this.conteoPorProveedor().get(id) ?? 0);
  }

  // Eje independiente, igual que seleccionarNivel: elegir el mismo
  // proveedor otra vez lo apaga.
  seleccionarProveedor(id: number | null): void {
    this.proveedorFiltroId.set(this.proveedorFiltroId() === id ? null : id);
  }

  estaColapsada(id: number): boolean {
    return this.categoriasColapsadas().has(id);
  }

  alternarColapso(id: number): void {
    this.categoriasColapsadas.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });
  }

  // ---- Formulario de alta/edición de insumo ----
  modoFormulario = signal<ModoFormularioInsumo>(null);
  insumoEditandoId = signal<number | null>(null);
  nombreForm = signal('');
  unidadForm = signal('g');
  minimoForm = signal(0);
  proveedorIdForm = signal<number | null>(null);
  categoriaIdForm = signal<number | null>(null);
  procesandoForm = signal(false);
  errorFormulario = signal('');

  // Alta rápida de proveedor dentro del mismo formulario.
  mostrarNuevoProveedor = signal(false);
  nombreProveedorForm = signal('');
  procesandoProveedor = signal(false);

  // Alta rápida de categoría dentro del mismo formulario (2026-10-08) —
  // mismo patrón que el proveedor de arriba.
  mostrarNuevaCategoria = signal(false);
  nombreCategoriaForm = signal('');
  procesandoCategoria = signal(false);

  // ---- Ventana de movimiento (entrada / ajuste) ----
  tipoMovimiento = signal<TipoMovimiento>(null);
  insumoMovimiento = signal<Insumo | null>(null);
  cantidadMovimientoForm = signal<number | null>(null);
  // Unidad en la que se está CAPTURANDO el movimiento (puede ser distinta a
  // la unidad base del insumo — ver opcionesSurtido arriba).
  unidadMovimientoForm = signal('g');
  motivoMovimientoForm = signal('');
  procesandoMovimiento = signal(false);
  errorMovimiento = signal('');

  // Opciones de unidad disponibles para el insumo del movimiento actual.
  opcionesUnidadMovimiento = computed<OpcionUnidadSurtido[]>(() => {
    const insumo = this.insumoMovimiento();
    return insumo ? opcionesSurtido(insumo.unidad_medida) : [];
  });

  // Cuánto equivale la cantidad capturada en la unidad base del insumo, para
  // mostrar "= 2500 g" bajo el campo cuando la unidad elegida no es la base.
  cantidadConvertida = computed(() => {
    const cantidad = this.cantidadMovimientoForm();
    const opcion = this.opcionesUnidadMovimiento().find(
      (o) => o.valor === this.unidadMovimientoForm(),
    );
    if (cantidad == null || !opcion) {
      return null;
    }
    return Math.round(cantidad * opcion.factor * 100) / 100;
  });

  mostrarConversion = computed(() => {
    const insumo = this.insumoMovimiento();
    return (
      !!insumo &&
      this.unidadMovimientoForm() !== insumo.unidad_medida &&
      this.cantidadConvertida() != null
    );
  });

  // ---- Historial expandible por fila ----
  insumoHistorialId = signal<number | null>(null);
  historialMovimientos = signal<MovimientoInventario[]>([]);
  cargandoHistorial = signal(false);

  constructor(
    private insumosService: InsumosService,
    private proveedoresService: ProveedoresService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarInsumos();
    this.cargarProveedores();
    this.cargarCategorias();
  }

  cargarInsumos(): void {
    this.cargando.set(true);
    this.insumosService.listar().subscribe({
      next: (insumos) => {
        this.insumos.set(insumos);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los insumos.');
        this.cargando.set(false);
      },
    });
  }

  cargarProveedores(): void {
    this.proveedoresService.listar().subscribe({
      next: (proveedores) => this.proveedores.set(proveedores),
      error: () => {
        // El formulario simplemente se queda sin opciones de proveedor; el
        // resto de la pantalla sigue funcionando.
      },
    });
  }

  cargarCategorias(): void {
    this.insumosService.listarCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: () => {
        // Sin categorías la lista simplemente sale sin agrupar (todo cae en
        // "Sin categoría"); el resto de la pantalla sigue funcionando.
      },
    });
  }

  // ---- Alta/edición de insumo ----

  abrirCreacionInsumo(): void {
    this.modoFormulario.set('crear');
    this.insumoEditandoId.set(null);
    this.nombreForm.set('');
    this.unidadForm.set('g');
    this.minimoForm.set(0);
    this.proveedorIdForm.set(null);
    // Si se estaba viendo una categoría filtrada, se preselecciona: lo más
    // común es dar de alta un insumo mientras se navega esa misma sección.
    this.categoriaIdForm.set(this.categoriaFiltroId());
    this.mostrarNuevoProveedor.set(false);
    this.nombreProveedorForm.set('');
    this.mostrarNuevaCategoria.set(false);
    this.nombreCategoriaForm.set('');
    this.errorFormulario.set('');
  }

  abrirEdicionInsumo(insumo: Insumo): void {
    this.modoFormulario.set('editar');
    this.insumoEditandoId.set(insumo.id);
    this.nombreForm.set(insumo.nombre);
    this.unidadForm.set(insumo.unidad_medida);
    this.minimoForm.set(insumo.cantidad_minima);
    this.proveedorIdForm.set(insumo.proveedor_id);
    this.categoriaIdForm.set(insumo.categoria_id);
    this.mostrarNuevoProveedor.set(false);
    this.nombreProveedorForm.set('');
    this.mostrarNuevaCategoria.set(false);
    this.nombreCategoriaForm.set('');
    this.errorFormulario.set('');
  }

  cerrarFormularioInsumo(): void {
    this.modoFormulario.set(null);
  }

  puedeGuardarInsumo(): boolean {
    if (this.procesandoForm()) {
      return false;
    }
    return (
      this.nombreForm().trim().length > 0 &&
      this.unidadForm().trim().length > 0 &&
      this.minimoForm() >= 0
    );
  }

  guardarFormularioInsumo(): void {
    if (!this.puedeGuardarInsumo()) {
      return;
    }
    this.procesandoForm.set(true);
    this.errorFormulario.set('');

    const datos: DatosInsumo = {
      nombre: this.nombreForm().trim(),
      unidad_medida: this.unidadForm(),
      cantidad_minima: this.minimoForm(),
      proveedor_id: this.proveedorIdForm(),
      categoria_id: this.categoriaIdForm(),
    };

    const peticion =
      this.modoFormulario() === 'crear'
        ? this.insumosService.crear(datos)
        : this.insumosService.editar(this.insumoEditandoId()!, datos);

    peticion.subscribe({
      next: () => {
        this.procesandoForm.set(false);
        this.modoFormulario.set(null);
        this.cargarInsumos();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoForm.set(false);
        this.errorFormulario.set(error.error?.error || 'Ocurrió un error al guardar el insumo.');
      },
    });
  }

  // Alta rápida de proveedor sin salir del formulario de insumo: lo agrega
  // al catálogo y lo deja preseleccionado.
  crearProveedorRapido(): void {
    const nombre = this.nombreProveedorForm().trim();
    if (!nombre || this.procesandoProveedor()) {
      return;
    }
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
        this.errorFormulario.set(error.error?.error || 'No se pudo crear el proveedor.');
      },
    });
  }

  // Alta rápida de categoría sin salir del formulario de insumo — mismo
  // patrón que crearProveedorRapido(): la agrega al catálogo y la deja
  // preseleccionada.
  crearCategoriaRapida(): void {
    const nombre = this.nombreCategoriaForm().trim();
    if (!nombre || this.procesandoCategoria()) {
      return;
    }
    this.procesandoCategoria.set(true);
    this.insumosService.crearCategoria(nombre).subscribe({
      next: (categoria) => {
        this.procesandoCategoria.set(false);
        this.categorias.update((lista) => [...lista, categoria].sort((a, b) => a.id - b.id));
        this.categoriaIdForm.set(categoria.id);
        this.mostrarNuevaCategoria.set(false);
        this.nombreCategoriaForm.set('');
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoCategoria.set(false);
        this.errorFormulario.set(error.error?.error || 'No se pudo crear la categoría.');
      },
    });
  }

  // ---- Movimientos (entrada / ajuste) ----

  abrirMovimiento(insumo: Insumo, tipo: 'entrada' | 'ajuste' | 'merma'): void {
    this.tipoMovimiento.set(tipo);
    this.insumoMovimiento.set(insumo);
    this.cantidadMovimientoForm.set(null);
    this.motivoMovimientoForm.set('');
    this.errorMovimiento.set('');
    // Por default se captura en la unidad "grande" (kg/L) cuando existe:
    // así se surte "2 kg de cebolla" en vez de "2000 g de cebolla".
    const opciones = opcionesSurtido(insumo.unidad_medida);
    this.unidadMovimientoForm.set(opciones[opciones.length - 1].valor);
  }

  cerrarMovimiento(): void {
    this.tipoMovimiento.set(null);
    this.insumoMovimiento.set(null);
  }

  puedeGuardarMovimiento(): boolean {
    if (this.procesandoMovimiento()) {
      return false;
    }
    const cantidad = this.cantidadMovimientoForm();
    if (cantidad == null || cantidad === 0) {
      return false;
    }
    // Una entrada siempre suma existencia; un ajuste puede ser negativo, pero
    // siempre necesita un motivo (es una corrección, no una operación de rutina).
    // Una merma es siempre positiva (cuánto se perdió) y también necesita motivo.
    if (
      (this.tipoMovimiento() === 'entrada' || this.tipoMovimiento() === 'merma') &&
      cantidad <= 0
    ) {
      return false;
    }
    if (
      (this.tipoMovimiento() === 'ajuste' || this.tipoMovimiento() === 'merma') &&
      this.motivoMovimientoForm().trim().length === 0
    ) {
      return false;
    }
    return true;
  }

  guardarMovimiento(): void {
    if (!this.puedeGuardarMovimiento()) {
      return;
    }
    const insumo = this.insumoMovimiento();
    const cantidad = this.cantidadMovimientoForm();
    if (!insumo || cantidad == null) {
      return;
    }

    this.procesandoMovimiento.set(true);
    this.errorMovimiento.set('');

    // Se manda siempre en la unidad BASE del insumo (la de consumo/receta):
    // si se capturó en kg/L, aquí se convierte a g/ml. El servidor nunca se
    // entera de en qué unidad se tecleó, solo recibe la cantidad ya en base.
    const factor =
      this.opcionesUnidadMovimiento().find((o) => o.valor === this.unidadMovimientoForm())
        ?.factor ?? 1;
    const cantidadBase = cantidad * factor;

    const motivo = this.motivoMovimientoForm().trim();
    const tipo = this.tipoMovimiento();
    const peticion =
      tipo === 'entrada'
        ? this.insumosService.registrarEntrada(
            insumo.id,
            cantidadBase,
            motivo || 'Entrada de mercancía',
          )
        : tipo === 'merma'
          ? this.insumosService.registrarMerma(insumo.id, cantidadBase, motivo)
          : this.insumosService.registrarAjuste(insumo.id, cantidadBase, motivo);

    peticion.subscribe({
      next: () => {
        this.procesandoMovimiento.set(false);
        this.cerrarMovimiento();
        this.cargarInsumos();
        // Si el historial de este insumo estaba abierto, se refresca también.
        if (this.insumoHistorialId() === insumo.id) {
          this.cargarHistorial(insumo.id);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoMovimiento.set(false);
        this.errorMovimiento.set(
          error.error?.error || 'Ocurrió un error al registrar el movimiento.',
        );
      },
    });
  }

  // ---- Historial ----

  alternarHistorial(insumo: Insumo): void {
    if (this.insumoHistorialId() === insumo.id) {
      this.insumoHistorialId.set(null);
      return;
    }
    this.insumoHistorialId.set(insumo.id);
    this.cargarHistorial(insumo.id);
  }

  private cargarHistorial(id: number): void {
    this.cargandoHistorial.set(true);
    this.insumosService.listarMovimientos(id).subscribe({
      next: (movimientos) => {
        this.historialMovimientos.set(movimientos);
        this.cargandoHistorial.set(false);
      },
      error: () => {
        this.cargandoHistorial.set(false);
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
