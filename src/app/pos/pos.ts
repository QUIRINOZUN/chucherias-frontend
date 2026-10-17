// =============================================================================
// pos/pos.ts — PUNTO DE VENTA (POS): MENÚ, CARRITO Y COBRO (RF-01, RF-02)
// =============================================================================
// Es la pantalla principal de trabajo del cajero. Su plantilla (pos.html) tiene
// cuatro zonas y esta clase maneja el estado de todas:
//
//   1. MENÚ ......... búsqueda por nombre, chips de categoría y tarjetas de
//                     producto expandibles (al tocar una se ven sus variantes).
//   2. CARRITO ...... líneas con cantidad, "Quitar ingredientes", notas y total.
//                     En pantallas anchas es una barra lateral; en angostas es
//                     un panel que sube desde abajo (botón flotante).
//   3. COBRO ........ ventana para elegir entrega y método de pago, capturar
//                     el monto recibido (efectivo) y ver el cambio.
//   4. COMPROBANTE .. resumen de la venta registrada, imprimible.
//   5. CAJA .......... "Saldo inicial" e "Ingresar efectivo" (botones propios
//                     del POS) y el aviso + ticket imprimible de un retiro
//                     que el administrador haya emitido (ver caja/caja.ts).
//
// FLUJO COMPLETO DE UNA VENTA
//   elegir producto → tocar una variante (se agrega al carrito) → personalizar
//   si hace falta → "Cobrar" → elegir entrega y pago → "Confirmar venta"
//   (POST /api/ventas) → comprobante → "Nueva venta" (limpia todo).
//
// MOVIMIENTOS DE CAJA DESDE EL POS
//   "Saldo inicial" e "Ingresar efectivo" los registra directo quien está en
//   el POS (POST /api/caja/movimientos). Un "Retiro" SOLO lo puede emitir el
//   administrador (desde la pantalla de Caja) — aquí solo se recibe el
//   aviso: cada 15 s (igual que el tablero de comandas) se consulta
//   GET /api/caja/retiros-pendientes; si hay uno sin confirmar se muestra en
//   pantalla, y al confirmarlo se imprime un ticket (comprobante físico para
//   el cajero de que ese dinero salió con autorización).
//
// REGLAS QUE ESTA PANTALLA RESPETA
//   - NUNCA envía precios al servidor: solo variante y cantidad. El servidor
//     lee el precio real de la base de datos.
//   - La personalización es POR UNIDAD: "sin tocino" en una hamburguesa nunca
//     afecta a otra idéntica del carrito (ver separarUnidad).
//   - Estado con "signals": cada dato reactivo se lee llamándolo como función,
//     p. ej. carrito(), y se cambia con .set() o .update().
// =============================================================================
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { CajaService, MovimientoCaja, TipoMovimientoCaja } from '../core/caja';
import { CatalogoService, Categoria, Producto, Variante } from '../core/catalogo';
import { Cliente, ClientesService } from '../core/clientes';
import { EmpleadosService, Repartidor } from '../core/empleados';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { InsumosService } from '../core/insumos';
import { ThemeService } from '../core/theme';
import { MetodoPago, RespuestaVenta, TipoEntrega, VentasService } from '../core/ventas';
import { obtenerEstiloCategoria } from './categoria-estilos';
import { IngredienteRemovible, obtenerIngredientesRemovibles } from './producto-ingredientes';
import { GrupoEleccion, OpcionEleccion, obtenerEleccionesDeVariante } from './producto-elecciones';

// Cada cuántos milisegundos se consulta si hay un retiro de efectivo sin
// confirmar (mismo intervalo que usa el tablero de comandas).
const INTERVALO_RETIROS_MS = 15000;

// "Ingrediente Extra para Pizza" (2026-10-09): el usuario notó que
// aparecía como un platillo más dentro de "Pizzas" (podía tocarse y
// agregarse solo, como si fuera una cuarta pizza) y pidió que en vez de
// eso se ofreciera DENTRO de personalizar cualquier pizza. Sigue siendo
// un producto real de catálogo (con sus propias variantes, precio y
// receta/inventario) — solo se oculta de la cuadrícula/búsqueda del menú
// (ver productosFiltrados) y se ofrece desde el panel de "Personalizar"
// de cualquier línea de pizza (ver esPizza/agregarIngredienteExtraPizza).
// Agregarlo sigue siendo, técnicamente, una línea de carrito aparte con
// su propio precio — exactamente como si el cajero lo hubiera agregado a
// mano desde el menú de antes — así el servidor sigue sin necesitar
// ningún concepto nuevo de "precio por elección" (ver nota de diseño al
// inicio del archivo: nunca se envían precios al servidor).
const NOMBRE_INGREDIENTE_EXTRA_PIZZA = 'Ingrediente Extra para Pizza';

// Una LÍNEA del carrito (no un producto: ver el campo `id`).
interface ItemCarrito {
  // Identifica la LÍNEA del carrito, no el producto: dos hamburguesas BBQ
  // personalizadas distinto (una sin tocino, otra normal) son dos líneas
  // con el mismo varianteId pero id distinto — así "Quitar" nunca se
  // aplica por accidente a la otra.
  id: string;
  varianteId: number;
  productoNombre: string;
  varianteNombre: string;
  // Precio solo para mostrar en pantalla; el servidor ignora esto y usa el suyo.
  precio: number;
  cantidad: number;
  // Ingredientes marcados con "Quitar" en esta línea (con su insumo real,
  // para que el servidor sepa qué NO descontar del inventario).
  ingredientesQuitados: IngredienteRemovible[];
  // Opciones de "elección" marcadas (salsa, topping…) — Fase 2 del recetario.
  eleccionesSeleccionadas: OpcionEleccion[];
  // Texto libre de "otras indicaciones".
  notasLibres: string;
}

// Billetes en circulación en México (excluye monedas: no tiene sentido
// ofrecerlas como "monto entregado" de un vistazo).
const DENOMINACIONES_MXN = [20, 50, 100, 200, 500, 1000];

// Foto de la venta ya registrada, con todo lo que muestra el comprobante.
// Se arma con los datos LOCALES del momento de cobrar (carrito, monto
// recibido…) más el número de orden que devolvió el servidor.
interface Recibo {
  venta: RespuestaVenta;
  items: ItemCarrito[];
  subtotal: number;
  total: number;
  metodoPago: MetodoPago;
  tipoEntrega: TipoEntrega;
  // Solo tienen valor cuando tipoEntrega es 'domicilio'.
  clienteNombre: string;
  clienteDireccion: string;
  clienteTelefono: string;
  // Nombre del repartidor asignado (2026-10-16), si tipoEntrega es
  // 'domicilio' y se eligió uno — null si no se asignó todavía.
  repartidorNombre: string | null;
  // RF-21/RF-22 (2026-10-15): nombre del cliente de LEALTAD (si se ligó
  // alguno) y el descuento que el SERVIDOR de verdad aplicó — nunca el
  // estimado local (ver previsualizacionLealtad), que puede no coincidir
  // si el cliente ya tenía una visita contada hoy por otra compra.
  clienteLealtadNombre: string | null;
  descuentoLealtad: number;
  montoRecibido: number | null;
  cambio: number | null;
  cajero: string;
  fecha: Date;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FocoDialogoDirective],
  templateUrl: './pos.html',
  styleUrl: './pos.css',
})
export class PosComponent implements OnInit, OnDestroy {
  // ---------------------------------------------------------------------------
  // Estado del MENÚ
  // ---------------------------------------------------------------------------
  categorias = signal<Categoria[]>([]);
  productos = signal<Producto[]>([]);
  // null = "Todas las categorías".
  categoriaSeleccionada = signal<number | null>(null);
  busqueda = signal('');
  // Producto cuyo detalle (variantes/tamaños) está abierto en la ventana
  // emergente; null = ninguna abierta. Antes esto se desplegaba dentro de
  // la propia tarjeta en la rejilla, pero con varias variantes se veía
  // saturado y descolocaba a las tarjetas vecinas — ahora se abre en una
  // ventana aparte, con más espacio y sin mover el resto del menú.
  productoAbierto = signal<Producto | null>(null);

  // ---------------------------------------------------------------------------
  // Estado del CARRITO
  // ---------------------------------------------------------------------------
  carrito = signal<ItemCarrito[]>([]);
  // Solo aplica en pantallas angostas: si el panel deslizable está abierto.
  carritoAbierto = signal(false);
  // id de línea del carrito cuyo selector de "Quitar ingredientes" está
  // abierto; null si ninguno lo está.
  quitarAbiertoPara = signal<string | null>(null);
  // Igual que quitarAbiertoPara, pero para el selector de "elección"
  // (salsa/topping/dip) — Fase 2 del recetario.
  eleccionAbiertaPara = signal<string | null>(null);
  // id de línea cuyo panel de personalización (Quitar / Elección / notas
  // libres) está expandido; null = todas colapsadas. Colapsado por defecto
  // a propósito: con una cuenta de varios productos, un renglón fijo de
  // personalización por cada uno (casi siempre vacío) alargaba mucho el
  // carrito y obligaba a desplazar de más — ver notaCompleta() para el
  // resumen de una línea que SÍ tiene algo, visible aunque esté colapsada.
  personalizacionAbiertaPara = signal<string | null>(null);
  // Se expone la función tal cual para que la plantilla pueda consultar los
  // ingredientes removibles de cada producto.
  ingredientesDisponibles = obtenerIngredientesRemovibles;
  tipoEntrega = signal<TipoEntrega>('presencial');
  // Solo se piden y se mandan al servidor cuando tipoEntrega es 'domicilio'.
  clienteNombreForm = signal('');
  clienteDireccionForm = signal('');
  clienteTelefonoForm = signal('');
  // Repartidor asignado (2026-10-16, opcional — también se puede asignar
  // después desde Comandas). La lista se carga una vez al entrar al POS;
  // vacía = no hay repartidores activos capturados todavía.
  repartidores = signal<Repartidor[]>([]);
  repartidorSeleccionadoId = signal<number | null>(null);

  // ---------------------------------------------------------------------------
  // CLIENTE DE LEALTAD (RF-21/RF-22, 2026-10-15) — independiente de tipoEntrega:
  // un cliente de lealtad puede pedir presencial o a domicilio por igual.
  // Opcional: sin seleccionar ninguno, la venta es la de siempre (cliente
  // ocasional, sin descuento). Ver ClientesService para las reglas completas.
  // ---------------------------------------------------------------------------
  clienteLealtadQuery = signal('');
  resultadosClienteLealtad = signal<Cliente[]>([]);
  buscandoClienteLealtad = signal(false);
  clienteLealtadSeleccionado = signal<Cliente | null>(null);
  // Alta rápida cuando la búsqueda no encuentra al cliente.
  mostrarNuevoClienteLealtad = signal(false);
  nuevoClienteLealtadNombre = signal('');
  nuevoClienteLealtadTelefono = signal('');
  creandoClienteLealtad = signal(false);
  errorClienteLealtad = signal('');
  // Para no disparar una búsqueda en cada tecla — se reinicia en cada cambio.
  private debounceClienteLealtadId?: ReturnType<typeof setTimeout>;

  // ---------------------------------------------------------------------------
  // REGISTRO DE CLIENTE INDEPENDIENTE (2026-10-16): un botón de la barra
  // superior para dar de alta a un cliente SIN que compre nada — el mismo
  // alta rápida que ya existía dentro del cobro (ver arriba), pero accesible
  // en cualquier momento, sin carrito ni venta de por medio. Usa el mismo
  // ClientesService; no toca el carrito, el cobro ni tipoEntrega.
  // ---------------------------------------------------------------------------
  mostrarRegistroCliente = signal(false);
  nombreRegistroCliente = signal('');
  telefonoRegistroCliente = signal('');
  registrandoCliente = signal(false);
  errorRegistroCliente = signal('');
  // Cuando tiene valor, la ventana muestra la confirmación en vez del
  // formulario — "Nombre registrado con 0 visitas".
  clienteRegistrado = signal<Cliente | null>(null);

  // Contador para fabricar ids únicos de línea (item-1, item-2, …).
  private contadorIdItem = 0;

  cargando = signal(true);
  errorCarga = signal('');

  // Expuesto tal cual al template: mapea el nombre de la categoría a su
  // color e ícono, con un valor por defecto si aparece una categoría nueva.
  estiloCategoria = obtenerEstiloCategoria;

  // ---------------------------------------------------------------------------
  // Estado del COBRO y el COMPROBANTE
  // ---------------------------------------------------------------------------
  mostrarCobro = signal(false);
  metodoPago = signal<MetodoPago>('efectivo');
  // Lo que el cliente entregó en efectivo (null = aún no se captura).
  montoRecibido = signal<number | null>(null);
  procesandoVenta = signal(false);
  errorVenta = signal('');
  // Cuando tiene valor, la ventana muestra el comprobante en vez del cobro.
  recibo = signal<Recibo | null>(null);

  // ---------------------------------------------------------------------------
  // Estado de CAJA: "Saldo inicial" / "Ingresar efectivo" y el aviso + ticket
  // de un retiro que el administrador haya emitido.
  // ---------------------------------------------------------------------------
  // null = ventana cerrada; 'apertura' o 'ingreso' = abierta en ese modo.
  mostrarMovimientoCaja = signal<Extract<TipoMovimientoCaja, 'apertura' | 'ingreso'> | null>(null);
  montoMovimientoForm = signal<number | null>(null);
  motivoMovimientoForm = signal('');
  procesandoMovimientoCaja = signal(false);
  errorMovimientoCaja = signal('');

  // Retiro sin confirmar que el POS detectó por sondeo (ver ngOnInit). Al
  // confirmarlo pasa a `ticketRetiro`, que es lo que se imprime.
  retiroPendiente = signal<MovimientoCaja | null>(null);
  confirmandoRetiro = signal(false);
  errorRetiro = signal('');
  ticketRetiro = signal<MovimientoCaja | null>(null);

  // Referencia al temporizador del sondeo, para poder detenerlo al salir.
  private intervaloRetirosId?: ReturnType<typeof setInterval>;

  // ---------------------------------------------------------------------------
  // Valores calculados (se recalculan solos cuando cambia lo que leen)
  // ---------------------------------------------------------------------------

  // Productos que se muestran en el catálogo según búsqueda y categoría.
  // "Ingrediente Extra para Pizza" queda fuera a propósito (ver
  // NOMBRE_INGREDIENTE_EXTRA_PIZZA) — ya no se busca ni se toca como un
  // platillo aparte, se ofrece desde personalizar una pizza.
  productosFiltrados = computed(() => {
    const productos = this.productos().filter((p) => p.nombre !== NOMBRE_INGREDIENTE_EXTRA_PIZZA);
    const texto = this.busqueda().trim().toLowerCase();

    // Buscar por nombre ignora la categoría seleccionada a propósito: no
    // tiene sentido obligar al cajero a adivinar en qué categoría está
    // algo antes de poder buscarlo (lo pidió Ximena en la entrevista).
    if (texto) {
      return productos.filter((p) => p.nombre.toLowerCase().includes(texto));
    }

    const categoriaId = this.categoriaSeleccionada();
    return categoriaId ? productos.filter((p) => p.categoria_id === categoriaId) : productos;
  });

  // Total a cobrar: (precio + cargos extra de elección, RF-16) × cantidad
  // de cada línea. El servidor vuelve a calcular esto él solo al registrar
  // la venta (ver routes/ventas.js) — este total es solo lo que se MUESTRA
  // antes de cobrar, para que coincida con lo que de verdad se va a cobrar.
  totalCarrito = computed(() =>
    this.carrito().reduce(
      (suma, item) => suma + (item.precio + this.costoExtraDeLinea(item)) * item.cantidad,
      0,
    ),
  );

  // Cantidad total de artículos (suma de cantidades, no de líneas).
  cantidadItems = computed(() => this.carrito().reduce((suma, item) => suma + item.cantidad, 0));

  // RF-21/RF-22: estimación del descuento de lealtad ANTES de cobrar, para
  // que el cajero pida el monto correcto en efectivo. Es solo una vista
  // previa — el servidor es quien de verdad decide al registrar la venta
  // (POST /api/ventas), porque solo él sabe si ese cliente ya tuvo una
  // visita contada hoy por otra compra. null = sin cliente seleccionado o
  // el total no alcanza los $100 mínimos para contar visita.
  previsualizacionLealtad = computed(() => {
    const cliente = this.clienteLealtadSeleccionado();
    if (!cliente || this.totalCarrito() < 100) {
      return null;
    }
    const visitaNumero = cliente.visitas_acumuladas + 1;
    const porcentaje = visitaNumero === 10 ? 15 : visitaNumero === 5 ? 5 : 0;
    return { visitaNumero, porcentaje };
  });

  // Total que de verdad se le cobra al cliente: el de las líneas del
  // carrito menos el descuento de lealtad ESTIMADO (ver arriba). Es lo que
  // se usa para cobrar en efectivo y armar las sugerencias de billete —
  // `totalCarrito()` sigue siendo la suma cruda, sin descuento, para el
  // badge del carrito (ahí todavía no se ha elegido ningún cliente).
  totalAPagar = computed(() => {
    const total = this.totalCarrito();
    const preview = this.previsualizacionLealtad();
    if (!preview || preview.porcentaje === 0) {
      return total;
    }
    return Math.round(total * (1 - preview.porcentaje / 100) * 100) / 100;
  });

  // Botones rápidos de "con qué billete pagó": el total exacto (pago
  // justo, sin cambio) + cada denominación real por encima del total. Si
  // el cliente entrega una combinación que no calza con ningún billete
  // (ej. $105), el cajero sigue pudiendo teclear el monto a mano.
  sugerenciasEfectivo = computed(() => {
    const total = this.totalAPagar();
    return [total, ...DENOMINACIONES_MXN.filter((billete) => billete > total)];
  });

  // 2026-10-12: solo los billetes reales (20/50/100/200/500/1000) tienen una
  // ilustración vectorial propia (public/img/billetes/); el "total exacto"
  // de sugerenciasEfectivo casi siempre es un monto que no corresponde a
  // ningún billete real (ej. $46), así que ese botón sigue mostrando solo
  // el número.
  imagenBillete(monto: number): string | null {
    return DENOMINACIONES_MXN.includes(monto) ? `/img/billetes/billete_${monto}.svg` : null;
  }

  // Cambio a devolver = monto recibido - total. Solo tiene sentido en
  // efectivo y con un monto capturado; si es negativo, todavía falta dinero.
  cambio = computed(() => {
    const recibido = this.montoRecibido();
    if (this.metodoPago() !== 'efectivo' || recibido == null) {
      return null;
    }
    const diferencia = recibido - this.totalAPagar();
    return diferencia;
  });

  constructor(
    private catalogoService: CatalogoService,
    private ventasService: VentasService,
    private cajaService: CajaService,
    private insumosService: InsumosService,
    private clientesService: ClientesService,
    private empleadosService: EmpleadosService,
    private authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  // Al abrir la pantalla se cargan categorías y productos del servidor, y
  // arranca el sondeo de retiros de efectivo sin confirmar.
  ngOnInit(): void {
    this.catalogoService.obtenerCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: (error: HttpErrorResponse) =>
        this.errorCarga.set(this.interpretarErrorConexion(error)),
    });

    this.catalogoService.obtenerProductos().subscribe({
      next: (productos) => {
        this.productos.set(productos);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorCarga.set(this.interpretarErrorConexion(error));
        this.cargando.set(false);
      },
    });

    this.verificarRetirosPendientes();
    this.intervaloRetirosId = setInterval(
      () => this.verificarRetirosPendientes(),
      INTERVALO_RETIROS_MS,
    );

    // RF-16 (2026-10-13): nombre de insumo → cargo extra. Falla en
    // silencio (el mapa se queda vacío): sin esto ninguna opción muestra
    // recargo, pero el resto del POS sigue funcionando igual.
    this.insumosService.obtenerCostosExtra().subscribe({
      next: (lista) => {
        const mapa = new Map<string, number>();
        for (const fila of lista) {
          mapa.set(fila.nombre, Number(fila.costo_extra));
        }
        this.costosExtraPorInsumo.set(mapa);
      },
      error: () => {},
    });

    // 2026-10-16: repartidores activos, para el selector del cobro a
    // domicilio. Falla en silencio — sin esto el selector simplemente no
    // aparece, no bloquea cobrar (el repartidor es opcional).
    this.empleadosService.listarRepartidores().subscribe({
      next: (lista) => this.repartidores.set(lista),
      error: () => {},
    });
  }

  // RF-16: nombre de insumo → cargo extra (solo los que de verdad tienen
  // uno, ver GET /api/insumos/costos-extra).
  costosExtraPorInsumo = signal<Map<string, number>>(new Map());

  // Cargo extra de UN insumo, o 0 si no tiene.
  costoExtraInsumo(nombreInsumo: string): number {
    return this.costosExtraPorInsumo().get(nombreInsumo) ?? 0;
  }

  // Suma de los cargos extra de las opciones ya elegidas en una línea — se
  // factura la MISMA cantidad de veces que aparece en eleccionesSeleccionadas
  // (si una opción con cargo se repite, el cargo se repite también).
  costoExtraDeLinea(item: ItemCarrito): number {
    return item.eleccionesSeleccionadas.reduce(
      (suma, opcion) => suma + this.costoExtraInsumo(opcion.insumo),
      0,
    );
  }

  // Subtotal de una línea del carrito, con cargos extra ya incluidos — lo
  // usa tanto el carrito como el comprobante impreso, para que ninguno de
  // los dos muestre un número distinto al total real que cobra el servidor.
  subtotalLinea(item: ItemCarrito): number {
    return (item.precio + this.costoExtraDeLinea(item)) * item.cantidad;
  }

  // Al salir de la pantalla se apaga el sondeo; si no, seguiría consultando
  // al servidor en segundo plano.
  ngOnDestroy(): void {
    if (this.intervaloRetirosId) {
      clearInterval(this.intervaloRetirosId);
    }
    clearTimeout(this.debounceClienteLealtadId);
  }

  // ===========================================================================
  // MENÚ: categorías, búsqueda y tarjetas
  // ===========================================================================

  // Chip de categoría (null = "Todas").
  seleccionarCategoria(categoriaId: number | null): void {
    this.categoriaSeleccionada.set(categoriaId);
    // Elegir una categoría con la búsqueda activa sería confuso (la
    // búsqueda manda sobre la categoría): al tocar un chip, se sale del
    // modo búsqueda para que el chip realmente se note.
    this.busqueda.set('');
  }

  actualizarBusqueda(valor: string): void {
    this.busqueda.set(valor);
  }

  // Un status 0 significa que la petición nunca llegó a obtener respuesta
  // (sin Internet, o Render/Neon todavía "despertando" — puede tardar
  // hasta ~90s la primera vez del día, ver CLAUDE.md). Un error con
  // respuesta del servidor es otra cosa (ej. token vencido).
  private interpretarErrorConexion(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica tu conexión a Internet, o espera unos segundos si es la primera venta del día (el servidor puede tardar en responder).';
    }
    return 'Ocurrió un error inesperado. Intenta de nuevo en unos momentos.';
  }

  // ¿Es este el producto cuya ventana de detalle está abierta?
  estaAbierto(productoId: number): boolean {
    return this.productoAbierto()?.id === productoId;
  }

  abrirDetalleProducto(producto: Producto): void {
    this.productoAbierto.set(producto);
  }

  cerrarDetalleProducto(): void {
    this.productoAbierto.set(null);
  }

  // Precio mostrado en la tarjeta colapsada: el de la variante más barata
  // (con "Desde" si el producto tiene más de una).
  precioDesde(producto: Producto): number {
    return Math.min(...producto.variantes.map((v) => v.precio));
  }

  // Insignia "ya está en el carrito" de la tarjeta colapsada (2026-10-11):
  // suma la cantidad de TODAS las líneas del carrito cuya variante pertenece
  // a este producto — una variante basta (no hace falta que sea siempre la
  // misma) porque la tarjeta representa al producto completo, no a una sola
  // presentación. Antes, agregar algo y volver a la rejilla se veía igual
  // que antes de agregarlo, sin ninguna pista; esto da retroalimentación
  // inmediata y ayuda a no duplicar por accidente.
  cantidadEnCarrito(producto: Producto): number {
    const idsVariantes = new Set(producto.variantes.map((v) => v.id));
    return this.carrito()
      .filter((item) => idsVariantes.has(item.varianteId))
      .reduce((total, item) => total + item.cantidad, 0);
  }

  // ===========================================================================
  // CARRITO
  // ===========================================================================

  // Fabrica un id único para una línea nueva del carrito.
  private generarIdItem(): string {
    this.contadorIdItem += 1;
    return `item-${this.contadorIdItem}`;
  }

  // Agrega UNA unidad de una variante al carrito (al tocar una variante en
  // la ventana de detalle del producto).
  agregarAlCarrito(producto: Producto, variante: Variante): void {
    this.carrito.update((items) => {
      // Solo se apila cantidad sobre una línea ya existente si esa línea
      // todavía no tiene ninguna personalización — si ya le quitaron algo
      // o tiene una nota, un "agregar" nuevo del mismo producto debe crear
      // su propia línea limpia, no mezclarse con la personalizada.
      const existente = items.find(
        (item) =>
          item.varianteId === variante.id &&
          item.ingredientesQuitados.length === 0 &&
          item.eleccionesSeleccionadas.length === 0 &&
          !item.notasLibres,
      );
      if (existente) {
        // Ya hay una línea limpia de esta variante: solo sube su cantidad.
        return items.map((item) =>
          item.id === existente.id ? { ...item, cantidad: item.cantidad + 1 } : item,
        );
      }
      // Si no, se crea una línea nueva con cantidad 1.
      return [
        ...items,
        {
          id: this.generarIdItem(),
          varianteId: variante.id,
          productoNombre: producto.nombre,
          varianteNombre: variante.nombre,
          precio: variante.precio,
          cantidad: 1,
          ingredientesQuitados: [],
          eleccionesSeleccionadas: [],
          notasLibres: '',
        },
      ];
    });

    // La ventana se cierra sola tras agregar: confirma la acción de un
    // vistazo y regresa al menú para seguir eligiendo.
    this.cerrarDetalleProducto();
  }

  // ---- "Ingrediente extra" dentro de personalizar una pizza (2026-10-09) ----
  // Ver NOMBRE_INGREDIENTE_EXTRA_PIZZA arriba: el producto real sigue
  // existiendo en el catálogo (con sus variantes Champiñones/Salchicha y
  // su precio/receta), solo se oculta de la cuadrícula; aquí se busca ese
  // mismo producto dentro de lo que el POS ya cargó, para ofrecer sus
  // variantes como botones de "agregar" dentro del panel de Personalizar
  // de cualquier línea de pizza.
  productoIngredienteExtraPizza = computed<Producto | null>(
    () => this.productos().find((p) => p.nombre === NOMBRE_INGREDIENTE_EXTRA_PIZZA) ?? null,
  );

  // Cualquier producto "Pizza X" ofrece el ingrediente extra — funciona
  // para pizzas futuras con el mismo prefijo sin tener que tocar código.
  esPizza(item: ItemCarrito): boolean {
    return item.productoNombre.startsWith('Pizza ');
  }

  // Agregar un ingrediente extra es, técnicamente, agregar OTRO producto
  // al carrito (reutiliza agregarAlCarrito tal cual) — no una propiedad de
  // la línea de la pizza. Queda como su propia línea con su propio precio
  // real (el servidor lo cobra exactamente igual que cualquier otra
  // variante); tocar el mismo ingrediente otra vez solo sube su cantidad
  // (mismo comportamiento de "apilar" que ya tiene agregarAlCarrito).
  agregarIngredienteExtraPizza(variante: Variante): void {
    const producto = this.productoIngredienteExtraPizza();
    if (!producto) {
      return;
    }
    this.agregarAlCarrito(producto, variante);
  }

  // La personalización (Quitar / notas) solo se ofrece en líneas de una
  // sola unidad — así nunca hay ambigüedad de "a cuál de las 2 le quito
  // el tocino". Si el cajero quiere personalizar una unidad dentro de una
  // línea con cantidad > 1, primero la separa en su propia línea de qty 1
  // (dejando el resto sin tocar) con este botón.
  separarUnidad(item: ItemCarrito): void {
    if (item.cantidad <= 1) {
      return;
    }
    const nuevoId = this.generarIdItem();
    this.carrito.update((items) => {
      const indice = items.findIndex((i) => i.id === item.id);
      if (indice === -1) {
        return items;
      }
      const original = items[indice];
      // La línea original pierde una unidad y aparece una línea nueva de 1
      // unidad justo debajo, con los mismos datos.
      const restante: ItemCarrito = { ...original, cantidad: original.cantidad - 1 };
      const nuevaLinea: ItemCarrito = { ...original, id: nuevoId, cantidad: 1 };
      const copia = [...items];
      copia.splice(indice, 1, restante, nuevaLinea);
      return copia;
    });
    // Abre de una vez el selector correspondiente sobre la unidad recién
    // separada: "Quitar" si el producto tiene ingredientes removibles
    // conocidos, o el de "elección" si la variante tiene salsa/topping/dip
    // a elegir (nunca los dos a la vez: se prioriza "Quitar").
    if (this.ingredientesDisponibles(item.productoNombre, item.varianteNombre).length > 0) {
      this.quitarAbiertoPara.set(nuevoId);
      this.personalizacionAbiertaPara.set(nuevoId);
    } else if (this.grupoEleccion(item.varianteId)) {
      this.eleccionAbiertaPara.set(nuevoId);
      this.personalizacionAbiertaPara.set(nuevoId);
    }
  }

  // Expande/colapsa el panel de personalización de una línea (Quitar /
  // Elección / notas libres), oculto por defecto para que el carrito no se
  // alargue con un renglón fijo por producto. Al colapsar se cierran
  // también los checklists internos, para que la próxima vez que se abra
  // empiece limpio.
  alternarPersonalizacion(item: ItemCarrito): void {
    const colapsando = this.personalizacionAbiertaPara() === item.id;
    this.personalizacionAbiertaPara.set(colapsando ? null : item.id);
    if (colapsando) {
      if (this.quitarAbiertoPara() === item.id) {
        this.quitarAbiertoPara.set(null);
      }
      if (this.eleccionAbiertaPara() === item.id) {
        this.eleccionAbiertaPara.set(null);
      }
    }
  }

  // Abre/cierra la lista de casillas de "Quitar" de una línea (solo una a la
  // vez, y nunca junto con el selector de elección).
  alternarPickerQuitar(item: ItemCarrito): void {
    this.quitarAbiertoPara.update((actual) => (actual === item.id ? null : item.id));
    if (this.eleccionAbiertaPara() === item.id) {
      this.eleccionAbiertaPara.set(null);
    }
  }

  // Se compara por `insumo` (la clave real, estable) y no por el objeto en
  // sí, que se recrea cada vez que se llama a ingredientesDisponibles().
  estaQuitado(item: ItemCarrito, ingrediente: IngredienteRemovible): boolean {
    return item.ingredientesQuitados.some((i) => i.insumo === ingrediente.insumo);
  }

  // Marca o desmarca un ingrediente como "quitado" en esa línea.
  alternarIngredienteQuitado(item: ItemCarrito, ingrediente: IngredienteRemovible): void {
    this.carrito.update((items) =>
      items.map((i) => {
        if (i.id !== item.id) {
          return i;
        }
        const yaEsta = i.ingredientesQuitados.some((ing) => ing.insumo === ingrediente.insumo);
        return {
          ...i,
          ingredientesQuitados: yaEsta
            ? i.ingredientesQuitados.filter((ing) => ing.insumo !== ingrediente.insumo)
            : [...i.ingredientesQuitados, ingrediente],
        };
      }),
    );
  }

  // ===========================================================================
  // ELECCIÓN (salsa / topping / dip) — Fase 2 del recetario
  // ===========================================================================

  // El único grupo de elección de la variante de esta línea, o null si no
  // tiene (en cuyo caso el POS no muestra el botón de elección). Hoy ningún
  // producto tiene más de un grupo real (ver producto-elecciones.ts), así
  // que la pantalla solo maneja "el primero".
  grupoEleccion(varianteId: number): GrupoEleccion | null {
    return obtenerEleccionesDeVariante(varianteId)[0] ?? null;
  }

  // Abre/cierra el selector de elección de una línea (solo uno a la vez, y
  // nunca junto con el de "Quitar": se cierra el otro al abrir este).
  alternarPickerEleccion(item: ItemCarrito): void {
    this.eleccionAbiertaPara.update((actual) => (actual === item.id ? null : item.id));
    if (this.quitarAbiertoPara() === item.id) {
      this.quitarAbiertoPara.set(null);
    }
  }

  estaElegido(item: ItemCarrito, opcion: OpcionEleccion): boolean {
    return item.eleccionesSeleccionadas.some((e) => e.insumo === opcion.insumo);
  }

  // Cuántas veces está elegida ESTA opción en particular (para el contador
  // +/- de los grupos que permiten repetir, ej. "doble Nutella").
  cantidadElegida(item: ItemCarrito, opcion: OpcionEleccion): number {
    return item.eleccionesSeleccionadas.filter((e) => e.insumo === opcion.insumo).length;
  }

  // Cuántas selecciones lleva el grupo en total (sumando repetidos) — para
  // saber si ya llegó al máximo y para el aviso "llevas X de Y".
  totalElegidoGrupo(item: ItemCarrito, grupo: GrupoEleccion): number {
    const insumosDelGrupo = new Set(grupo.opciones.map((o) => o.insumo));
    return item.eleccionesSeleccionadas.filter((e) => insumosDelGrupo.has(e.insumo)).length;
  }

  // Suma una unidad más de esta opción (grupos con permiteRepetidos, ej.
  // toppings de crepa/waffle) — no hace nada si el grupo ya está en su
  // máximo, sin importar de qué opción venga ese máximo.
  incrementarEleccionRepetible(
    item: ItemCarrito,
    grupo: GrupoEleccion,
    opcion: OpcionEleccion,
  ): void {
    this.carrito.update((items) =>
      items.map((i) => {
        if (i.id !== item.id || this.totalElegidoGrupo(i, grupo) >= grupo.seleccionesPermitidas) {
          return i;
        }
        return { ...i, eleccionesSeleccionadas: [...i.eleccionesSeleccionadas, opcion] };
      }),
    );
  }

  // Quita una unidad de esta opción (la primera que encuentre) — no hace
  // nada si no hay ninguna de esa opción elegida todavía.
  decrementarEleccionRepetible(
    item: ItemCarrito,
    grupo: GrupoEleccion,
    opcion: OpcionEleccion,
  ): void {
    this.carrito.update((items) =>
      items.map((i) => {
        if (i.id !== item.id) {
          return i;
        }
        const indice = i.eleccionesSeleccionadas.findIndex((e) => e.insumo === opcion.insumo);
        if (indice === -1) {
          return i;
        }
        const copia = [...i.eleccionesSeleccionadas];
        copia.splice(indice, 1);
        return { ...i, eleccionesSeleccionadas: copia };
      }),
    );
  }

  // Marca/desmarca una opción — solo para grupos SIN `permiteRepetidos`
  // (salsa, dip, ingrediente gratis, cacahuate: cada opción máximo una
  // vez). Si el grupo solo permite 1 (la mayoría), elegir una opción nueva
  // reemplaza cualquier otra del mismo grupo (comportamiento de radio). Si
  // permite varias sin repetir (ej. 2-3 sabores de salsa en un paquete
  // grande), se acumulan hasta el máximo; un toque de más simplemente no
  // hace nada.
  alternarEleccion(item: ItemCarrito, grupo: GrupoEleccion, opcion: OpcionEleccion): void {
    this.carrito.update((items) =>
      items.map((i) => {
        if (i.id !== item.id) {
          return i;
        }
        const insumosDelGrupo = new Set(grupo.opciones.map((o) => o.insumo));
        const yaElegido = i.eleccionesSeleccionadas.some((e) => e.insumo === opcion.insumo);

        if (yaElegido) {
          return {
            ...i,
            eleccionesSeleccionadas: i.eleccionesSeleccionadas.filter(
              (e) => e.insumo !== opcion.insumo,
            ),
          };
        }

        const fueraDelGrupo = i.eleccionesSeleccionadas.filter(
          (e) => !insumosDelGrupo.has(e.insumo),
        );
        const dentroDelGrupo = i.eleccionesSeleccionadas.filter((e) =>
          insumosDelGrupo.has(e.insumo),
        );

        if (grupo.seleccionesPermitidas === 1) {
          // Radio: la nueva opción reemplaza cualquier otra de este grupo.
          return { ...i, eleccionesSeleccionadas: [...fueraDelGrupo, opcion] };
        }
        if (dentroDelGrupo.length >= grupo.seleccionesPermitidas) {
          return i; // Ya eligió el máximo permitido; se ignora el toque.
        }
        return { ...i, eleccionesSeleccionadas: [...fueraDelGrupo, ...dentroDelGrupo, opcion] };
      }),
    );
  }

  // true si la línea ya tiene al menos el mínimo de elecciones que su
  // variante requiere (o si no requiere ninguna, o si el grupo es de
  // elección libre con minimoSelecciones: 0 — toppings de crepa/waffle,
  // que nunca bloquean el cobro). Se usa para no dejar confirmar una venta
  // con una elección a medias (ej. alitas sin salsa elegida).
  personalizacionCompleta(item: ItemCarrito): boolean {
    const grupo = this.grupoEleccion(item.varianteId);
    if (!grupo) {
      return true;
    }
    const minimo = grupo.minimoSelecciones ?? grupo.seleccionesPermitidas;
    return this.totalElegidoGrupo(item, grupo) >= minimo;
  }

  // Guarda lo que se escribe en "Otras indicaciones" de esa línea.
  actualizarNotasLibres(item: ItemCarrito, valor: string): void {
    this.carrito.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, notasLibres: valor } : i)),
    );
  }

  // Combina "quitar" + "elección" + indicación libre en un solo texto — es lo
  // que viaja al backend en la columna `notas` (texto libre, para que
  // cualquiera lo lea de un vistazo). La versión ESTRUCTURADA (para el
  // descuento automático) va aparte, en el payload de confirmarVenta().
  // Ejemplo: "Sin: Tocino, Cebolla morada · Con: Buffalo · sin picante".
  notaCompleta(item: ItemCarrito): string {
    const partes: string[] = [];
    if (item.ingredientesQuitados.length > 0) {
      partes.push('Sin: ' + item.ingredientesQuitados.map((i) => i.display).join(', '));
    }
    if (item.eleccionesSeleccionadas.length > 0) {
      // Se agrupan por insumo para que un sabor elegido más de una vez
      // (ej. "doble Nutella") salga como "Nutella ×2" y no repetido.
      const conteos = new Map<string, { display: string; cantidad: number; costoExtra: number }>();
      for (const eleccion of item.eleccionesSeleccionadas) {
        const actual = conteos.get(eleccion.insumo);
        if (actual) {
          actual.cantidad += 1;
        } else {
          conteos.set(eleccion.insumo, {
            display: eleccion.display,
            cantidad: 1,
            costoExtra: this.costoExtraInsumo(eleccion.insumo),
          });
        }
      }
      // RF-16 (2026-10-13): la opción con cargo lo muestra junto al nombre
      // ("Cacahuate enchilado (+$5.00)") para que quede claro por qué subió
      // el total antes de confirmar la venta.
      const texto = [...conteos.values()]
        .map((c) => {
          const nombre = c.cantidad > 1 ? `${c.display} ×${c.cantidad}` : c.display;
          return c.costoExtra > 0
            ? `${nombre} (+${(c.costoExtra * c.cantidad).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })})`
            : nombre;
        })
        .join(', ');
      partes.push('Con: ' + texto);
    }
    if (item.notasLibres.trim()) {
      partes.push(item.notasLibres.trim());
    }
    return partes.join(' · ');
  }

  // Botón "+" de una línea.
  incrementar(item: ItemCarrito): void {
    this.carrito.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i)),
    );
  }

  // Botón "−" de una línea: baja la cantidad y, si llega a 0, la línea se elimina.
  decrementar(item: ItemCarrito): void {
    this.carrito.update((items) =>
      items
        .map((i) => (i.id === item.id ? { ...i, cantidad: i.cantidad - 1 } : i))
        .filter((i) => i.cantidad > 0),
    );
  }

  // Botón de eliminar una línea completa.
  quitarDelCarrito(item: ItemCarrito): void {
    this.carrito.update((items) => items.filter((i) => i.id !== item.id));
    if (this.quitarAbiertoPara() === item.id) {
      this.quitarAbiertoPara.set(null);
    }
    if (this.eleccionAbiertaPara() === item.id) {
      this.eleccionAbiertaPara.set(null);
    }
    if (this.personalizacionAbiertaPara() === item.id) {
      this.personalizacionAbiertaPara.set(null);
    }
  }

  // Presencial (el cliente está en el local) o a domicilio. Viaja al servidor
  // y aparece en el comprobante y en el tablero de comandas.
  seleccionarTipoEntrega(tipo: TipoEntrega): void {
    this.tipoEntrega.set(tipo);
    // Si se vuelve a presencial, se limpian para no mandar basura si el
    // cajero cambia de opinión después de haber empezado a escribir.
    if (tipo === 'presencial') {
      this.clienteNombreForm.set('');
      this.clienteDireccionForm.set('');
      this.clienteTelefonoForm.set('');
      this.repartidorSeleccionadoId.set(null);
    }
  }

  seleccionarRepartidor(id: string): void {
    this.repartidorSeleccionadoId.set(id ? +id : null);
  }

  // ===========================================================================
  // CLIENTE DE LEALTAD (RF-21/RF-22)
  // ===========================================================================

  // Typeahead: busca por nombre o teléfono con un pequeño retraso (no en
  // cada tecla) para no saturar al servidor. Menos de 2 caracteres no busca.
  buscarClienteLealtad(texto: string): void {
    this.clienteLealtadQuery.set(texto);
    this.mostrarNuevoClienteLealtad.set(false);
    clearTimeout(this.debounceClienteLealtadId);
    if (texto.trim().length < 2) {
      this.resultadosClienteLealtad.set([]);
      return;
    }
    this.debounceClienteLealtadId = setTimeout(() => {
      this.buscandoClienteLealtad.set(true);
      this.clientesService.buscar(texto).subscribe({
        next: (resultados) => {
          this.resultadosClienteLealtad.set(resultados);
          this.buscandoClienteLealtad.set(false);
        },
        error: () => {
          this.resultadosClienteLealtad.set([]);
          this.buscandoClienteLealtad.set(false);
        },
      });
    }, 300);
  }

  seleccionarClienteLealtad(cliente: Cliente): void {
    this.clienteLealtadSeleccionado.set(cliente);
    this.clienteLealtadQuery.set('');
    this.resultadosClienteLealtad.set([]);
    this.mostrarNuevoClienteLealtad.set(false);
  }

  quitarClienteLealtad(): void {
    this.clienteLealtadSeleccionado.set(null);
  }

  // La búsqueda no encontró al cliente: se ofrece un alta rápida con lo que
  // ya se tecleó como nombre inicial (el cajero puede corregirlo).
  abrirNuevoClienteLealtad(): void {
    this.mostrarNuevoClienteLealtad.set(true);
    this.nuevoClienteLealtadNombre.set(this.clienteLealtadQuery());
    this.nuevoClienteLealtadTelefono.set('');
    this.errorClienteLealtad.set('');
  }

  cancelarNuevoClienteLealtad(): void {
    this.mostrarNuevoClienteLealtad.set(false);
  }

  crearClienteLealtad(): void {
    const nombre = this.nuevoClienteLealtadNombre().trim();
    if (!nombre) {
      this.errorClienteLealtad.set('El nombre del cliente es obligatorio.');
      return;
    }
    this.creandoClienteLealtad.set(true);
    this.errorClienteLealtad.set('');
    this.clientesService.crear(nombre, this.nuevoClienteLealtadTelefono().trim()).subscribe({
      next: (cliente) => {
        this.creandoClienteLealtad.set(false);
        this.seleccionarClienteLealtad(cliente);
      },
      error: (error: HttpErrorResponse) => {
        this.creandoClienteLealtad.set(false);
        this.errorClienteLealtad.set(error.error?.error || 'Error al crear el cliente.');
      },
    });
  }

  // ===========================================================================
  // REGISTRO DE CLIENTE INDEPENDIENTE (botón de la barra superior): dar de
  // alta a un cliente sin que compre nada. No toca el carrito ni el cobro.
  // ===========================================================================

  abrirRegistroCliente(): void {
    this.nombreRegistroCliente.set('');
    this.telefonoRegistroCliente.set('');
    this.errorRegistroCliente.set('');
    this.clienteRegistrado.set(null);
    this.mostrarRegistroCliente.set(true);
  }

  cerrarRegistroCliente(): void {
    this.mostrarRegistroCliente.set(false);
  }

  registrarCliente(): void {
    const nombre = this.nombreRegistroCliente().trim();
    if (!nombre) {
      this.errorRegistroCliente.set('El nombre del cliente es obligatorio.');
      return;
    }
    this.registrandoCliente.set(true);
    this.errorRegistroCliente.set('');
    this.clientesService.crear(nombre, this.telefonoRegistroCliente().trim()).subscribe({
      next: (cliente) => {
        this.registrandoCliente.set(false);
        // Se queda en la misma ventana mostrando la confirmación —
        // "Registrar otro" reinicia el formulario sin tener que reabrir.
        this.clienteRegistrado.set(cliente);
      },
      error: (error: HttpErrorResponse) => {
        this.registrandoCliente.set(false);
        this.errorRegistroCliente.set(error.error?.error || 'Error al registrar el cliente.');
      },
    });
  }

  // "Registrar otro": vuelve al formulario vacío sin cerrar la ventana.
  registrarOtroCliente(): void {
    this.nombreRegistroCliente.set('');
    this.telefonoRegistroCliente.set('');
    this.errorRegistroCliente.set('');
    this.clienteRegistrado.set(null);
  }

  // Panel del carrito en pantallas angostas.
  abrirCarrito(): void {
    this.carritoAbierto.set(true);
  }

  cerrarCarrito(): void {
    this.carritoAbierto.set(false);
  }

  // ===========================================================================
  // COBRO
  // ===========================================================================

  // Botón "Cobrar": abre la ventana de cobro con valores iniciales limpios
  // (efectivo, sin monto). No hace nada si el carrito está vacío.
  abrirCobro(): void {
    if (this.carrito().length === 0) {
      return;
    }
    this.errorVenta.set('');
    this.metodoPago.set('efectivo');
    this.montoRecibido.set(null);
    this.carritoAbierto.set(false);
    this.mostrarCobro.set(true);
  }

  cerrarCobro(): void {
    this.mostrarCobro.set(false);
  }

  // Elige efectivo o transferencia. En transferencia no hay monto que capturar.
  seleccionarMetodoPago(metodo: MetodoPago): void {
    this.metodoPago.set(metodo);
    if (metodo !== 'efectivo') {
      this.montoRecibido.set(null);
    }
  }

  // Campo "O teclea el monto exacto": vacío o inválido = sin monto.
  actualizarMontoRecibido(valor: string): void {
    const numero = Number(valor);
    this.montoRecibido.set(valor === '' || Number.isNaN(numero) ? null : numero);
  }

  // Botones rápidos de billete: llenan el monto igual que si se tecleara.
  seleccionarMontoSugerido(monto: number): void {
    this.montoRecibido.set(monto);
  }

  // Decide si "Confirmar venta" está habilitado: hay carrito, no hay otra
  // venta en proceso, ninguna línea tiene una elección a medias (ej. alitas
  // sin salsa) y, si es efectivo, el monto cubre el total (cambio ≥ 0).
  puedeConfirmar(): boolean {
    if (this.carrito().length === 0 || this.procesandoVenta()) {
      return false;
    }
    if (!this.carrito().every((item) => this.personalizacionCompleta(item))) {
      return false;
    }
    if (
      this.tipoEntrega() === 'domicilio' &&
      (!this.clienteNombreForm().trim() ||
        !this.clienteDireccionForm().trim() ||
        !this.clienteTelefonoForm().trim())
    ) {
      return false;
    }
    if (this.metodoPago() === 'efectivo') {
      const cambio = this.cambio();
      return cambio != null && cambio >= 0;
    }
    return true;
  }

  // Mensaje que explica por qué no se puede cobrar todavía, si aplica (falta
  // una elección). El botón deshabilitado por sí solo no dice qué falta.
  avisoPersonalizacionFaltante(): string {
    const falta = this.carrito().find((item) => !this.personalizacionCompleta(item));
    if (!falta) {
      return '';
    }
    const grupo = this.grupoEleccion(falta.varianteId);
    return `Falta elegir "${grupo?.etiqueta}" en ${falta.productoNombre} (${falta.varianteNombre}).`;
  }

  // "Confirmar venta": envía la venta al servidor y, si sale bien, arma el
  // comprobante con los datos del momento.
  confirmarVenta(): void {
    if (!this.puedeConfirmar()) {
      return;
    }

    this.procesandoVenta.set(true);
    this.errorVenta.set('');

    // Se toma una "foto" de los datos ahora: el comprobante debe reflejar lo
    // cobrado aunque el carrito cambie después.
    const itemsCarrito = this.carrito();
    const metodoPago = this.metodoPago();
    const tipoEntrega = this.tipoEntrega();
    const clienteNombre = this.clienteNombreForm().trim();
    const clienteDireccion = this.clienteDireccionForm().trim();
    const clienteTelefono = this.clienteTelefonoForm().trim();
    const montoRecibido = this.montoRecibido();
    const total = this.totalCarrito();
    const clienteLealtad = this.clienteLealtadSeleccionado();
    const repartidorId = this.repartidorSeleccionadoId();

    // Lo que viaja al servidor: método, entrega y, por línea, SOLO variante,
    // cantidad y notas. Ningún precio. Datos del cliente solo si es domicilio.
    // cliente_id es opcional (RF-21/RF-22) — el servidor vuelve a calcular el
    // descuento de lealtad él solo, nunca se envía un porcentaje o monto.
    const payload = {
      metodo_pago: metodoPago,
      tipo_entrega: tipoEntrega,
      ...(tipoEntrega === 'domicilio'
        ? {
            cliente_nombre: clienteNombre,
            cliente_direccion: clienteDireccion,
            cliente_telefono: clienteTelefono,
            ...(repartidorId ? { repartidor_id: repartidorId } : {}),
          }
        : {}),
      ...(clienteLealtad ? { cliente_id: clienteLealtad.id } : {}),
      items: itemsCarrito.map((item) => ({
        variante_id: item.varianteId,
        cantidad: item.cantidad,
        notas: this.notaCompleta(item) || undefined,
        // Fase 2 del recetario: nombres de insumo EXACTOS (tabla `insumos`)
        // que el servidor debe excluir del descuento automático al preparar
        // esta línea. Vacío si no se quitó nada.
        insumos_quitados: item.ingredientesQuitados.map((i) => i.insumo),
        // Y los que SÍ se deben agregar al descuento (salsa/topping elegidos),
        // con su cantidad — no vienen de la receta porque esa línea se dejó
        // fuera a propósito (ver scripts/seed-recetas.js).
        insumos_elegidos: item.eleccionesSeleccionadas.map((e) => ({
          insumo: e.insumo,
          cantidad: e.cantidad,
          unidad_medida: e.unidad,
        })),
      })),
    };

    this.ventasService.registrarVenta(payload).subscribe({
      next: (respuesta) => {
        this.procesandoVenta.set(false);
        // El total/descuento REALES son los que decidió el servidor (puede
        // diferir de la vista previa si, por ejemplo, este cliente ya tenía
        // una visita contada hoy por otra compra) — el comprobante siempre
        // refleja lo que de verdad se cobró, no la estimación de pantalla.
        const totalReal = Number(respuesta.venta.total);
        const descuentoReal = Number(respuesta.venta.descuento_lealtad);
        // Al tener `recibo`, la ventana pasa de "cobro" a "comprobante".
        this.recibo.set({
          venta: respuesta,
          items: itemsCarrito,
          subtotal: total,
          total: totalReal,
          metodoPago,
          tipoEntrega,
          clienteNombre,
          clienteDireccion,
          clienteTelefono,
          repartidorNombre: this.repartidores().find((r) => r.id === repartidorId)?.nombre || null,
          clienteLealtadNombre: clienteLealtad?.nombre_completo || null,
          descuentoLealtad: descuentoReal,
          montoRecibido: metodoPago === 'efectivo' ? montoRecibido : null,
          cambio: metodoPago === 'efectivo' ? (montoRecibido ?? 0) - totalReal : null,
          cajero: this.authService.usuarioActual()?.nombre || '',
          fecha: new Date(),
        });
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoVenta.set(false);
        // Se prefiere el mensaje del servidor; si no hubo respuesta, el de conexión.
        this.errorVenta.set(error.error?.error || this.interpretarErrorConexion(error));
      },
    });
  }

  // Abre el diálogo de impresión del navegador. El estilo @media print de
  // pos.css hace que solo salga el comprobante, en blanco y negro.
  imprimirRecibo(): void {
    window.print();
  }

  // "Nueva venta": deja la pantalla lista para el siguiente cliente, con todos
  // los valores en su estado inicial.
  nuevaVenta(): void {
    this.carrito.set([]);
    this.carritoAbierto.set(false);
    this.quitarAbiertoPara.set(null);
    this.eleccionAbiertaPara.set(null);
    this.mostrarCobro.set(false);
    this.recibo.set(null);
    this.metodoPago.set('efectivo');
    this.tipoEntrega.set('presencial');
    this.clienteNombreForm.set('');
    this.clienteDireccionForm.set('');
    this.clienteTelefonoForm.set('');
    this.repartidorSeleccionadoId.set(null);
    this.montoRecibido.set(null);
    this.clienteLealtadSeleccionado.set(null);
    this.clienteLealtadQuery.set('');
    this.resultadosClienteLealtad.set([]);
    this.mostrarNuevoClienteLealtad.set(false);
    this.errorClienteLealtad.set('');
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ===========================================================================
  // CAJA: "Saldo inicial" / "Ingresar efectivo" y el aviso + ticket de retiro
  // ===========================================================================

  // Abre la ventana de "Saldo inicial" o "Ingresar efectivo" (nunca de
  // retiro: eso solo lo emite el administrador desde la pantalla de Caja).
  abrirMovimientoCaja(tipo: 'apertura' | 'ingreso'): void {
    this.mostrarMovimientoCaja.set(tipo);
    this.montoMovimientoForm.set(null);
    this.motivoMovimientoForm.set('');
    this.errorMovimientoCaja.set('');
  }

  cerrarMovimientoCaja(): void {
    this.mostrarMovimientoCaja.set(null);
  }

  puedeGuardarMovimientoCaja(): boolean {
    const monto = this.montoMovimientoForm();
    return monto != null && monto > 0 && !this.procesandoMovimientoCaja();
  }

  guardarMovimientoCaja(): void {
    const tipo = this.mostrarMovimientoCaja();
    if (!tipo || !this.puedeGuardarMovimientoCaja()) {
      return;
    }
    this.procesandoMovimientoCaja.set(true);
    this.errorMovimientoCaja.set('');

    this.cajaService
      .registrarMovimiento(tipo, this.montoMovimientoForm()!, this.motivoMovimientoForm().trim())
      .subscribe({
        next: () => {
          this.procesandoMovimientoCaja.set(false);
          this.mostrarMovimientoCaja.set(null);
        },
        error: (error: HttpErrorResponse) => {
          this.procesandoMovimientoCaja.set(false);
          this.errorMovimientoCaja.set(error.error?.error || 'No se pudo registrar el movimiento.');
        },
      });
  }

  // Sondeo: ¿hay un retiro de efectivo que el administrador ya emitió y este
  // cajero todavía no ve? No se muestra encima del comprobante de una venta
  // ni mientras ya se está confirmando otro, para no encimar ventanas.
  private verificarRetirosPendientes(): void {
    if (this.recibo() || this.confirmandoRetiro() || this.ticketRetiro()) {
      return;
    }
    this.cajaService.obtenerRetirosPendientes().subscribe({
      next: (retiros) => this.retiroPendiente.set(retiros[0] ?? null),
      error: () => {
        // Un fallo del sondeo no interrumpe el resto del POS; se reintenta
        // en el siguiente ciclo (15 s después).
      },
    });
  }

  // El cajero confirma que vio el retiro: dispara el ticket imprimible.
  confirmarRetiroPendiente(): void {
    const retiro = this.retiroPendiente();
    if (!retiro || this.confirmandoRetiro()) {
      return;
    }
    this.confirmandoRetiro.set(true);
    this.errorRetiro.set('');

    this.cajaService.confirmarRetiro(retiro.id).subscribe({
      next: (confirmado) => {
        this.confirmandoRetiro.set(false);
        this.retiroPendiente.set(null);
        this.ticketRetiro.set(confirmado);
      },
      error: (error: HttpErrorResponse) => {
        this.confirmandoRetiro.set(false);
        // 409 = alguien más (otra sesión del mismo cajero) ya lo confirmó;
        // se quita el aviso sin tronar, el siguiente sondeo ya no lo trae.
        if (error.status === 409) {
          this.retiroPendiente.set(null);
          return;
        }
        this.errorRetiro.set(error.error?.error || 'No se pudo confirmar el retiro.');
      },
    });
  }

  // Abre el diálogo de impresión del navegador para el ticket de retiro
  // (mismo mecanismo que imprimirRecibo: @media print en pos.css).
  imprimirTicketRetiro(): void {
    window.print();
  }

  // Cierra el ticket una vez impreso/visto; el sondeo sigue su curso normal.
  cerrarTicketRetiro(): void {
    this.ticketRetiro.set(null);
  }
}
