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
//
// FLUJO COMPLETO DE UNA VENTA
//   elegir producto → tocar una variante (se agrega al carrito) → personalizar
//   si hace falta → "Cobrar" → elegir entrega y pago → "Confirmar venta"
//   (POST /api/ventas) → comprobante → "Nueva venta" (limpia todo).
//
// REGLAS QUE ESTA PANTALLA RESPETA
//   - NUNCA envía precios al servidor: solo variante y cantidad. El servidor
//     lee el precio real de la base de datos.
//   - La personalización es POR UNIDAD: "sin tocino" en una hamburguesa nunca
//     afecta a otra idéntica del carrito (ver separarUnidad).
//   - Estado con "signals": cada dato reactivo se lee llamándolo como función,
//     p. ej. carrito(), y se cambia con .set() o .update().
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { CatalogoService, Categoria, Producto, Variante } from '../core/catalogo';
import { ThemeService } from '../core/theme';
import { MetodoPago, RespuestaVenta, TipoEntrega, VentasService } from '../core/ventas';
import { obtenerEstiloCategoria } from './categoria-estilos';
import { obtenerIngredientesRemovibles } from './producto-ingredientes';

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
  // Ingredientes marcados con "Quitar" en esta línea.
  ingredientesQuitados: string[];
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
  montoRecibido: number | null;
  cambio: number | null;
  cajero: string;
  fecha: Date;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './pos.html',
  styleUrl: './pos.css',
})
export class PosComponent implements OnInit {
  // ---------------------------------------------------------------------------
  // Estado del MENÚ
  // ---------------------------------------------------------------------------
  categorias = signal<Categoria[]>([]);
  productos = signal<Producto[]>([]);
  // null = "Todas las categorías".
  categoriaSeleccionada = signal<number | null>(null);
  busqueda = signal('');
  // Conjunto de ids de productos cuya tarjeta está expandida (mostrando variantes).
  productosExpandidos = signal<ReadonlySet<number>>(new Set());

  // ---------------------------------------------------------------------------
  // Estado del CARRITO
  // ---------------------------------------------------------------------------
  carrito = signal<ItemCarrito[]>([]);
  // Solo aplica en pantallas angostas: si el panel deslizable está abierto.
  carritoAbierto = signal(false);
  // id de línea del carrito cuyo selector de "Quitar ingredientes" está
  // abierto; null si ninguno lo está.
  quitarAbiertoPara = signal<string | null>(null);
  // Se expone la función tal cual para que la plantilla pueda consultar los
  // ingredientes removibles de cada producto.
  ingredientesDisponibles = obtenerIngredientesRemovibles;
  tipoEntrega = signal<TipoEntrega>('presencial');

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
  // Valores calculados (se recalculan solos cuando cambia lo que leen)
  // ---------------------------------------------------------------------------

  // Productos que se muestran en el catálogo según búsqueda y categoría.
  productosFiltrados = computed(() => {
    const productos = this.productos();
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

  // Total a cobrar: suma de precio × cantidad de cada línea.
  totalCarrito = computed(() =>
    this.carrito().reduce((suma, item) => suma + item.precio * item.cantidad, 0),
  );

  // Cantidad total de artículos (suma de cantidades, no de líneas).
  cantidadItems = computed(() => this.carrito().reduce((suma, item) => suma + item.cantidad, 0));

  // Botones rápidos de "con qué billete pagó": el total exacto (pago
  // justo, sin cambio) + cada denominación real por encima del total. Si
  // el cliente entrega una combinación que no calza con ningún billete
  // (ej. $105), el cajero sigue pudiendo teclear el monto a mano.
  sugerenciasEfectivo = computed(() => {
    const total = this.totalCarrito();
    return [total, ...DENOMINACIONES_MXN.filter((billete) => billete > total)];
  });

  // Cambio a devolver = monto recibido - total. Solo tiene sentido en
  // efectivo y con un monto capturado; si es negativo, todavía falta dinero.
  cambio = computed(() => {
    const recibido = this.montoRecibido();
    if (this.metodoPago() !== 'efectivo' || recibido == null) {
      return null;
    }
    const diferencia = recibido - this.totalCarrito();
    return diferencia;
  });

  constructor(
    private catalogoService: CatalogoService,
    private ventasService: VentasService,
    private authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  // Al abrir la pantalla se cargan categorías y productos del servidor.
  ngOnInit(): void {
    this.catalogoService.obtenerCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: (error: HttpErrorResponse) => this.errorCarga.set(this.interpretarErrorConexion(error)),
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

  // ¿La tarjeta de este producto está desplegada?
  estaExpandido(productoId: number): boolean {
    return this.productosExpandidos().has(productoId);
  }

  // Expande o colapsa una tarjeta. Se crea un Set NUEVO en cada cambio porque
  // las signals detectan cambios por referencia, no por contenido.
  alternarExpansion(productoId: number): void {
    this.productosExpandidos.update((actuales) => {
      const nuevo = new Set(actuales);
      if (nuevo.has(productoId)) {
        nuevo.delete(productoId);
      } else {
        nuevo.add(productoId);
      }
      return nuevo;
    });
  }

  // Precio mostrado en la tarjeta colapsada: el de la variante más barata
  // (con "Desde" si el producto tiene más de una).
  precioDesde(producto: Producto): number {
    return Math.min(...producto.variantes.map((v) => v.precio));
  }

  // ===========================================================================
  // CARRITO
  // ===========================================================================

  // Fabrica un id único para una línea nueva del carrito.
  private generarIdItem(): string {
    this.contadorIdItem += 1;
    return `item-${this.contadorIdItem}`;
  }

  // Agrega UNA unidad de una variante al carrito (al tocar una variante en la
  // tarjeta expandida).
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
          notasLibres: '',
        },
      ];
    });

    // La tarjeta se cierra sola tras agregar: confirma la acción de un
    // vistazo y libera espacio para seguir viendo el resto del menú.
    this.productosExpandidos.update((actuales) => {
      if (!actuales.has(producto.id)) {
        return actuales;
      }
      const nuevo = new Set(actuales);
      nuevo.delete(producto.id);
      return nuevo;
    });
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
    // Abre de una vez el selector de "Quitar" sobre la unidad recién
    // separada, si el producto tiene ingredientes removibles conocidos.
    if (this.ingredientesDisponibles(item.productoNombre).length > 0) {
      this.quitarAbiertoPara.set(nuevoId);
    }
  }

  // Abre/cierra la lista de casillas de "Quitar" de una línea (solo una a la vez).
  alternarPickerQuitar(item: ItemCarrito): void {
    this.quitarAbiertoPara.update((actual) => (actual === item.id ? null : item.id));
  }

  estaQuitado(item: ItemCarrito, ingrediente: string): boolean {
    return item.ingredientesQuitados.includes(ingrediente);
  }

  // Marca o desmarca un ingrediente como "quitado" en esa línea.
  alternarIngredienteQuitado(item: ItemCarrito, ingrediente: string): void {
    this.carrito.update((items) =>
      items.map((i) => {
        if (i.id !== item.id) {
          return i;
        }
        const yaEsta = i.ingredientesQuitados.includes(ingrediente);
        return {
          ...i,
          ingredientesQuitados: yaEsta
            ? i.ingredientesQuitados.filter((ing) => ing !== ingrediente)
            : [...i.ingredientesQuitados, ingrediente],
        };
      }),
    );
  }

  // Guarda lo que se escribe en "Otras indicaciones" de esa línea.
  actualizarNotasLibres(item: ItemCarrito, valor: string): void {
    this.carrito.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, notasLibres: valor } : i)),
    );
  }

  // Combina lo que se marcó "quitar" con cualquier indicación libre en un
  // solo texto — es lo que realmente viaja al backend (columna `notas`,
  // texto libre; no hay tabla de ingredientes removibles todavía).
  // Ejemplo de resultado: "Sin: Tocino, Cebolla morada · sin picante".
  notaCompleta(item: ItemCarrito): string {
    const partes: string[] = [];
    if (item.ingredientesQuitados.length > 0) {
      partes.push('Sin: ' + item.ingredientesQuitados.join(', '));
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
  }

  // Presencial (el cliente está en el local) o a domicilio. Viaja al servidor
  // y aparece en el comprobante y en el tablero de comandas.
  seleccionarTipoEntrega(tipo: TipoEntrega): void {
    this.tipoEntrega.set(tipo);
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

  // Decide si "Confirmar venta" está habilitado: hay carrito, no hay otra venta
  // en proceso y, si es efectivo, el monto cubre el total (cambio ≥ 0).
  puedeConfirmar(): boolean {
    if (this.carrito().length === 0 || this.procesandoVenta()) {
      return false;
    }
    if (this.metodoPago() === 'efectivo') {
      const cambio = this.cambio();
      return cambio != null && cambio >= 0;
    }
    return true;
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
    const montoRecibido = this.montoRecibido();
    const total = this.totalCarrito();

    // Lo que viaja al servidor: método, entrega y, por línea, SOLO variante,
    // cantidad y notas. Ningún precio.
    const payload = {
      metodo_pago: metodoPago,
      tipo_entrega: this.tipoEntrega(),
      items: itemsCarrito.map((item) => ({
        variante_id: item.varianteId,
        cantidad: item.cantidad,
        notas: this.notaCompleta(item) || undefined,
      })),
    };

    this.ventasService.registrarVenta(payload).subscribe({
      next: (respuesta) => {
        this.procesandoVenta.set(false);
        // Al tener `recibo`, la ventana pasa de "cobro" a "comprobante".
        this.recibo.set({
          venta: respuesta,
          items: itemsCarrito,
          subtotal: total,
          total,
          metodoPago,
          tipoEntrega,
          montoRecibido: metodoPago === 'efectivo' ? montoRecibido : null,
          cambio: metodoPago === 'efectivo' ? (montoRecibido ?? 0) - total : null,
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
    this.mostrarCobro.set(false);
    this.recibo.set(null);
    this.metodoPago.set('efectivo');
    this.tipoEntrega.set('presencial');
    this.montoRecibido.set(null);
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
