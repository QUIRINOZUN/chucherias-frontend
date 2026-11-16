// =============================================================================
// compras/compras.ts — COMPRAS Y PROVEEDORES (2026-11-16)
// =============================================================================
// Pantalla "Compras". Solo administrador y encargado (costos y abastecimiento).
// Tres pestañas:
//   Por surtir  → los insumos que ya están bajo su mínimo, agrupados por
//                 proveedor, con una cantidad sugerida editable; de ahí se
//                 arma la orden de compra.
//   Pedidos     → las órdenes (pendientes, recibidas, canceladas). Al llegar la
//                 mercancía se captura lo recibido y lo pagado: eso registra la
//                 entrada de inventario y actualiza el costo del insumo, igual
//                 que una "Entrada" manual de Inventario pero de un solo paso.
//   Proveedores → alta, edición y baja del catálogo.
// Las órdenes necesitan la migración 2026-11-16_ordenes_compra.sql; sin ella la
// pestaña "Pedidos" avisa que falta habilitarla y "Por surtir" funciona igual.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import {
  ComprasService,
  EstadoCompra,
  OrdenCompraDetalle,
  OrdenCompraResumen,
  PrecioProveedor,
  SugerenciaCompra,
} from '../core/compras';
import { Proveedor, ProveedoresService } from '../core/proveedores';
import { ThemeService } from '../core/theme';

type Pestana = 'surtir' | 'pedidos' | 'proveedores';

interface GrupoSurtir {
  proveedorId: number | null;
  proveedor: string;
  items: SugerenciaCompra[];
}

@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FocoDialogoDirective],
  templateUrl: './compras.html',
  styleUrl: './compras.css',
})
export class ComprasComponent implements OnInit {
  pestana = signal<Pestana>('surtir');

  // ---- Por surtir ----
  sugerencias = signal<SugerenciaCompra[]>([]);
  cargandoSugerencias = signal(true);
  errorSugerencias = signal('');
  // insumo_id → cantidad (texto) de los renglones SELECCIONADOS para la orden.
  seleccion = signal<Map<number, string>>(new Map());
  creandoOrden = signal(false);
  errorOrden = signal('');
  avisoOrden = signal('');

  grupos = computed<GrupoSurtir[]>(() => {
    const mapa = new Map<number | null, GrupoSurtir>();
    for (const s of this.sugerencias()) {
      const llave = s.proveedor_id;
      if (!mapa.has(llave)) {
        mapa.set(llave, {
          proveedorId: llave,
          proveedor: s.proveedor ?? 'Sin proveedor asignado',
          items: [],
        });
      }
      mapa.get(llave)!.items.push(s);
    }
    return [...mapa.values()];
  });

  // ---- Pedidos ----
  ordenes = signal<OrdenCompraResumen[]>([]);
  filtroEstado = signal<EstadoCompra | ''>('pendiente');
  cargandoOrdenes = signal(false);
  errorOrdenes = signal('');
  ordenAbierta = signal<OrdenCompraDetalle | null>(null);
  recibido = signal<Map<number, { cantidad: string; costo: string }>>(new Map());
  trabajandoRecepcion = signal(false);
  errorRecepcion = signal('');

  // ---- Proveedores ----
  proveedores = signal<Proveedor[]>([]);
  cargandoProveedores = signal(true);
  formProveedor = signal<{
    id: number | null;
    nombre: string;
    contacto: string;
    telefono: string;
  } | null>(null);
  guardandoProveedor = signal(false);
  errorProveedor = signal('');
  proveedorAEliminar = signal<Proveedor | null>(null);
  errorEliminarProveedor = signal('');

  // ---- Comparar precios ----
  comparandoInsumo = signal<{ nombre: string; precios: PrecioProveedor[] } | null>(null);

  constructor(
    private comprasService: ComprasService,
    private proveedoresService: ProveedoresService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarSugerencias();
    this.cargarProveedores();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  cambiarPestana(p: Pestana): void {
    this.pestana.set(p);
    if (p === 'pedidos') this.cargarOrdenes();
  }

  // ===================== Por surtir =====================
  cargarSugerencias(): void {
    this.cargandoSugerencias.set(true);
    this.errorSugerencias.set('');
    this.comprasService.sugerencias().subscribe({
      next: (lista) => {
        this.sugerencias.set(lista);
        // Por defecto se marca todo lo que tenga una cantidad sugerida mayor a 0.
        const mapa = new Map<number, string>();
        for (const s of lista) {
          if (s.cantidad_sugerida > 0) mapa.set(s.insumo_id, String(s.cantidad_sugerida));
        }
        this.seleccion.set(mapa);
        this.cargandoSugerencias.set(false);
      },
      error: () => {
        this.errorSugerencias.set('No se pudo calcular lo que hay que surtir.');
        this.cargandoSugerencias.set(false);
      },
    });
  }

  estaSeleccionado(id: number): boolean {
    return this.seleccion().has(id);
  }

  cantidadDe(id: number): string {
    return this.seleccion().get(id) ?? '';
  }

  alternarSeleccion(s: SugerenciaCompra): void {
    this.seleccion.update((m) => {
      const nuevo = new Map(m);
      if (nuevo.has(s.insumo_id)) nuevo.delete(s.insumo_id);
      else
        nuevo.set(
          s.insumo_id,
          String(s.cantidad_sugerida > 0 ? s.cantidad_sugerida : s.cantidad_minima),
        );
      return nuevo;
    });
  }

  cambiarCantidad(id: number, texto: string): void {
    this.seleccion.update((m) => new Map(m).set(id, texto));
  }

  seleccionadosDe(grupo: GrupoSurtir): number {
    return grupo.items.filter((i) => this.seleccion().has(i.insumo_id)).length;
  }

  // Costo estimado del grupo (solo renglones seleccionados con costo conocido).
  estimadoDe(grupo: GrupoSurtir): number {
    let total = 0;
    for (const i of grupo.items) {
      const cant = Number(this.seleccion().get(i.insumo_id));
      if (Number.isFinite(cant) && i.costo_unitario !== null) total += cant * i.costo_unitario;
    }
    return total;
  }

  crearOrden(grupo: GrupoSurtir): void {
    this.errorOrden.set('');
    this.avisoOrden.set('');
    const items: { insumo_id: number; cantidad_pedida: number }[] = [];
    for (const i of grupo.items) {
      const texto = this.seleccion().get(i.insumo_id);
      if (texto === undefined) continue;
      const cantidad = Number(texto);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        this.errorOrden.set(`La cantidad de "${i.nombre}" debe ser mayor a cero.`);
        return;
      }
      items.push({ insumo_id: i.insumo_id, cantidad_pedida: cantidad });
    }
    if (items.length === 0) {
      this.errorOrden.set('Marca al menos un insumo para la orden.');
      return;
    }
    this.creandoOrden.set(true);
    this.comprasService.crear({ proveedor_id: grupo.proveedorId, items }).subscribe({
      next: (r) => {
        this.creandoOrden.set(false);
        this.avisoOrden.set(`Orden #${r.id} creada. La encuentras en "Pedidos".`);
        this.cargarSugerencias();
      },
      error: (e: HttpErrorResponse) => {
        this.creandoOrden.set(false);
        this.errorOrden.set(e.error?.error || 'No se pudo crear la orden.');
      },
    });
  }

  verPrecios(s: SugerenciaCompra): void {
    this.comprasService.precios(s.insumo_id).subscribe({
      next: (precios) => this.comparandoInsumo.set({ nombre: s.nombre, precios }),
      error: () => this.comparandoInsumo.set({ nombre: s.nombre, precios: [] }),
    });
  }

  // ===================== Pedidos =====================
  cargarOrdenes(): void {
    this.cargandoOrdenes.set(true);
    this.errorOrdenes.set('');
    const estado = this.filtroEstado();
    this.comprasService.listar(estado || undefined).subscribe({
      next: (lista) => {
        this.ordenes.set(lista);
        this.cargandoOrdenes.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.ordenes.set([]);
        this.cargandoOrdenes.set(false);
        this.errorOrdenes.set(e.error?.error || 'No se pudieron cargar los pedidos.');
      },
    });
  }

  elegirEstado(estado: EstadoCompra | ''): void {
    this.filtroEstado.set(estado);
    this.cargarOrdenes();
  }

  abrirOrden(o: OrdenCompraResumen): void {
    this.errorRecepcion.set('');
    this.comprasService.obtener(o.id).subscribe({
      next: (det) => {
        const mapa = new Map<number, { cantidad: string; costo: string }>();
        for (const r of det.items) {
          mapa.set(r.id, {
            cantidad: String(r.cantidad_recibida ?? r.cantidad_pedida),
            costo: r.costo_total_recibido !== null ? String(r.costo_total_recibido) : '',
          });
        }
        this.recibido.set(mapa);
        this.ordenAbierta.set(det);
      },
      error: (e: HttpErrorResponse) =>
        this.errorOrdenes.set(e.error?.error || 'No se pudo abrir la orden.'),
    });
  }

  cerrarOrden(): void {
    if (this.trabajandoRecepcion()) return;
    this.ordenAbierta.set(null);
  }

  campoRecibido(id: number, campo: 'cantidad' | 'costo', texto: string): void {
    this.recibido.update((m) => {
      const nuevo = new Map(m);
      const actual = nuevo.get(id) ?? { cantidad: '', costo: '' };
      nuevo.set(id, { ...actual, [campo]: texto });
      return nuevo;
    });
  }

  valorRecibido(id: number, campo: 'cantidad' | 'costo'): string {
    return this.recibido().get(id)?.[campo] ?? '';
  }

  registrarLlegada(): void {
    const orden = this.ordenAbierta();
    if (!orden) return;
    const items: { detalle_id: number; cantidad_recibida: number; costo_total: number | null }[] =
      [];
    for (const r of orden.items) {
      const dato = this.recibido().get(r.id);
      const cantidad = Number(dato?.cantidad);
      if (
        dato === undefined ||
        dato.cantidad.trim() === '' ||
        !Number.isFinite(cantidad) ||
        cantidad < 0
      ) {
        this.errorRecepcion.set(`Revisa la cantidad recibida de "${r.nombre}" (0 si no llegó).`);
        return;
      }
      const costoTexto = dato.costo.trim();
      const costo = costoTexto === '' ? null : Number(costoTexto);
      if (costo !== null && (!Number.isFinite(costo) || costo < 0)) {
        this.errorRecepcion.set(`Revisa el costo de "${r.nombre}".`);
        return;
      }
      items.push({ detalle_id: r.id, cantidad_recibida: cantidad, costo_total: costo });
    }
    this.errorRecepcion.set('');
    this.trabajandoRecepcion.set(true);
    this.comprasService.recibir(orden.id, items).subscribe({
      next: () => {
        this.trabajandoRecepcion.set(false);
        this.ordenAbierta.set(null);
        this.cargarOrdenes();
        this.cargarSugerencias();
      },
      error: (e: HttpErrorResponse) => {
        this.trabajandoRecepcion.set(false);
        this.errorRecepcion.set(e.error?.error || 'No se pudo registrar la llegada.');
      },
    });
  }

  cancelarOrden(): void {
    const orden = this.ordenAbierta();
    if (
      !orden ||
      !window.confirm(`¿Cancelar la orden #${orden.id}? No se registrará ninguna entrada.`)
    )
      return;
    this.trabajandoRecepcion.set(true);
    this.comprasService.cancelar(orden.id).subscribe({
      next: () => {
        this.trabajandoRecepcion.set(false);
        this.ordenAbierta.set(null);
        this.cargarOrdenes();
        this.cargarSugerencias();
      },
      error: (e: HttpErrorResponse) => {
        this.trabajandoRecepcion.set(false);
        this.errorRecepcion.set(e.error?.error || 'No se pudo cancelar la orden.');
      },
    });
  }

  // ===================== Proveedores =====================
  cargarProveedores(): void {
    this.cargandoProveedores.set(true);
    this.proveedoresService.listar().subscribe({
      next: (lista) => {
        this.proveedores.set(lista);
        this.cargandoProveedores.set(false);
      },
      error: () => this.cargandoProveedores.set(false),
    });
  }

  abrirProveedor(p?: Proveedor): void {
    this.errorProveedor.set('');
    this.formProveedor.set({
      id: p?.id ?? null,
      nombre: p?.nombre ?? '',
      contacto: p?.contacto ?? '',
      telefono: p?.telefono ?? '',
    });
  }

  campoProveedor(campo: 'nombre' | 'contacto' | 'telefono', texto: string): void {
    this.formProveedor.update((f) => (f ? { ...f, [campo]: texto } : f));
  }

  guardarProveedor(): void {
    const f = this.formProveedor();
    if (!f || !f.nombre.trim()) {
      this.errorProveedor.set('El nombre del proveedor es obligatorio.');
      return;
    }
    this.guardandoProveedor.set(true);
    const datos = {
      nombre: f.nombre.trim(),
      contacto: f.contacto.trim(),
      telefono: f.telefono.trim(),
    };
    const peticion =
      f.id === null
        ? this.proveedoresService.crear(datos)
        : this.proveedoresService.editar(f.id, datos);
    peticion.subscribe({
      next: () => {
        this.guardandoProveedor.set(false);
        this.formProveedor.set(null);
        this.cargarProveedores();
      },
      error: (e: HttpErrorResponse) => {
        this.guardandoProveedor.set(false);
        this.errorProveedor.set(e.error?.error || 'No se pudo guardar el proveedor.');
      },
    });
  }

  confirmarEliminarProveedor(): void {
    const p = this.proveedorAEliminar();
    if (!p) return;
    this.proveedoresService.eliminar(p.id).subscribe({
      next: () => {
        this.proveedorAEliminar.set(null);
        this.cargarProveedores();
      },
      error: (e: HttpErrorResponse) =>
        this.errorEliminarProveedor.set(e.error?.error || 'No se pudo eliminar el proveedor.'),
    });
  }
}
