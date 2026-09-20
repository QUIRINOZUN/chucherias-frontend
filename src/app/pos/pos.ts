import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { CatalogoService, Categoria, Producto, Variante } from '../core/catalogo';
import { ThemeService } from '../core/theme';
import { MetodoPago, RespuestaVenta, VentasService } from '../core/ventas';
import { obtenerEstiloCategoria } from './categoria-estilos';

interface ItemCarrito {
  varianteId: number;
  productoNombre: string;
  varianteNombre: string;
  precio: number;
  cantidad: number;
  notas: string;
}

interface Recibo {
  venta: RespuestaVenta;
  items: ItemCarrito[];
  subtotal: number;
  total: number;
  metodoPago: MetodoPago;
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
  categorias = signal<Categoria[]>([]);
  productos = signal<Producto[]>([]);
  categoriaSeleccionada = signal<number | null>(null);
  productosExpandidos = signal<ReadonlySet<number>>(new Set());
  carrito = signal<ItemCarrito[]>([]);
  carritoAbierto = signal(false);

  cargando = signal(true);
  errorCarga = signal('');

  // Expuesto tal cual al template: mapea el nombre de la categoría a su
  // color e ícono, con un valor por defecto si aparece una categoría nueva.
  estiloCategoria = obtenerEstiloCategoria;

  mostrarCobro = signal(false);
  metodoPago = signal<MetodoPago>('efectivo');
  montoRecibido = signal<number | null>(null);
  procesandoVenta = signal(false);
  errorVenta = signal('');
  recibo = signal<Recibo | null>(null);

  productosFiltrados = computed(() => {
    const categoriaId = this.categoriaSeleccionada();
    const productos = this.productos();
    return categoriaId ? productos.filter((p) => p.categoria_id === categoriaId) : productos;
  });

  totalCarrito = computed(() =>
    this.carrito().reduce((suma, item) => suma + item.precio * item.cantidad, 0),
  );

  cantidadItems = computed(() => this.carrito().reduce((suma, item) => suma + item.cantidad, 0));

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

  ngOnInit(): void {
    this.catalogoService.obtenerCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: () => this.errorCarga.set('No se pudieron cargar las categorías.'),
    });

    this.catalogoService.obtenerProductos().subscribe({
      next: (productos) => {
        this.productos.set(productos);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set('No se pudieron cargar los productos. Verifica tu conexión.');
        this.cargando.set(false);
      },
    });
  }

  seleccionarCategoria(categoriaId: number | null): void {
    this.categoriaSeleccionada.set(categoriaId);
  }

  estaExpandido(productoId: number): boolean {
    return this.productosExpandidos().has(productoId);
  }

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

  precioDesde(producto: Producto): number {
    return Math.min(...producto.variantes.map((v) => v.precio));
  }

  agregarAlCarrito(producto: Producto, variante: Variante): void {
    this.carrito.update((items) => {
      const existente = items.find((item) => item.varianteId === variante.id);
      if (existente) {
        return items.map((item) =>
          item.varianteId === variante.id ? { ...item, cantidad: item.cantidad + 1 } : item,
        );
      }
      return [
        ...items,
        {
          varianteId: variante.id,
          productoNombre: producto.nombre,
          varianteNombre: variante.nombre,
          precio: variante.precio,
          cantidad: 1,
          notas: '',
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

  actualizarNotas(item: ItemCarrito, valor: string): void {
    this.carrito.update((items) =>
      items.map((i) => (i.varianteId === item.varianteId ? { ...i, notas: valor } : i)),
    );
  }

  incrementar(item: ItemCarrito): void {
    this.carrito.update((items) =>
      items.map((i) => (i.varianteId === item.varianteId ? { ...i, cantidad: i.cantidad + 1 } : i)),
    );
  }

  decrementar(item: ItemCarrito): void {
    this.carrito.update((items) =>
      items
        .map((i) => (i.varianteId === item.varianteId ? { ...i, cantidad: i.cantidad - 1 } : i))
        .filter((i) => i.cantidad > 0),
    );
  }

  quitarDelCarrito(item: ItemCarrito): void {
    this.carrito.update((items) => items.filter((i) => i.varianteId !== item.varianteId));
  }

  abrirCarrito(): void {
    this.carritoAbierto.set(true);
  }

  cerrarCarrito(): void {
    this.carritoAbierto.set(false);
  }

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

  seleccionarMetodoPago(metodo: MetodoPago): void {
    this.metodoPago.set(metodo);
    if (metodo !== 'efectivo') {
      this.montoRecibido.set(null);
    }
  }

  actualizarMontoRecibido(valor: string): void {
    const numero = Number(valor);
    this.montoRecibido.set(valor === '' || Number.isNaN(numero) ? null : numero);
  }

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

  confirmarVenta(): void {
    if (!this.puedeConfirmar()) {
      return;
    }

    this.procesandoVenta.set(true);
    this.errorVenta.set('');

    const itemsCarrito = this.carrito();
    const metodoPago = this.metodoPago();
    const montoRecibido = this.montoRecibido();
    const total = this.totalCarrito();

    const payload = {
      metodo_pago: metodoPago,
      items: itemsCarrito.map((item) => ({
        variante_id: item.varianteId,
        cantidad: item.cantidad,
        notas: item.notas.trim() || undefined,
      })),
    };

    this.ventasService.registrarVenta(payload).subscribe({
      next: (respuesta) => {
        this.procesandoVenta.set(false);
        this.recibo.set({
          venta: respuesta,
          items: itemsCarrito,
          subtotal: total,
          total,
          metodoPago,
          montoRecibido: metodoPago === 'efectivo' ? montoRecibido : null,
          cambio: metodoPago === 'efectivo' ? (montoRecibido ?? 0) - total : null,
          cajero: this.authService.usuarioActual()?.nombre || '',
          fecha: new Date(),
        });
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoVenta.set(false);
        this.errorVenta.set(error.error?.error || 'Ocurrió un error al registrar la venta.');
      },
    });
  }

  imprimirRecibo(): void {
    window.print();
  }

  nuevaVenta(): void {
    this.carrito.set([]);
    this.carritoAbierto.set(false);
    this.mostrarCobro.set(false);
    this.recibo.set(null);
    this.metodoPago.set('efectivo');
    this.montoRecibido.set(null);
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
