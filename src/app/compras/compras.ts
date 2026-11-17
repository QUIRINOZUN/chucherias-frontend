// =============================================================================
// compras/compras.ts — COMPRAS Y PROVEEDORES (2026-11-16)
// =============================================================================
// Pantalla "Compras". Solo administrador y encargado (costos y abastecimiento).
// Dos pestañas:
//   Por surtir  → los insumos que ya están bajo su mínimo, agrupados por proveedor, con
//                 una cantidad sugerida editable. De ahí se copia la lista (o se abre
//                 WhatsApp) para hacer el pedido por fuera; cuando llega la mercancía se
//                 captura con "Entrada" en Inventario.
//   Proveedores → alta, edición y baja del catálogo.
// (Las órdenes de compra y su recepción se retiraron el 2026-11-17 por sencillez; el backend
//  conserva esas rutas, pero la pantalla ya no las usa.)
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { ComprasService, PrecioProveedor, SugerenciaCompra } from '../core/compras';
import { Proveedor, ProveedoresService } from '../core/proveedores';
import { ThemeService } from '../core/theme';

type Pestana = 'surtir' | 'proveedores';

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
  // insumo_id → cantidad (texto) de los renglones SELECCIONADOS para la lista.
  seleccion = signal<Map<number, string>>(new Map());
  avisoCopiado = signal('');

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

  // Texto del pedido de un proveedor, listo para pegarlo en WhatsApp o dictarlo por teléfono.
  textoLista(grupo: GrupoSurtir): string {
    const renglones: string[] = [];
    for (const i of grupo.items) {
      const texto = this.seleccion().get(i.insumo_id);
      if (texto === undefined) continue;
      renglones.push(`- ${i.nombre}: ${texto} ${i.unidad_medida}`);
    }
    return 'Hola, necesito:\n' + renglones.join('\n');
  }

  /** Copia la lista de un proveedor al portapapeles. */
  async copiarLista(grupo: GrupoSurtir): Promise<void> {
    this.avisoCopiado.set('');
    try {
      await navigator.clipboard.writeText(this.textoLista(grupo));
      this.avisoCopiado.set(`Lista de ${grupo.proveedor} copiada.`);
    } catch {
      this.avisoCopiado.set('No se pudo copiar. Anota la lista a mano.');
    }
  }

  /** Enlace de WhatsApp con la lista ya escrita (solo si el proveedor tiene teléfono). */
  enlaceWhatsApp(grupo: GrupoSurtir): string | null {
    const prov = this.proveedores().find((p) => p.id === grupo.proveedorId);
    const digitos = (prov?.telefono ?? '').replace(/\D/g, '');
    if (digitos.length < 10) return null;
    const numero = digitos.length === 10 ? '52' + digitos : digitos;
    return `https://wa.me/${numero}?text=${encodeURIComponent(this.textoLista(grupo))}`;
  }

  verPrecios(s: SugerenciaCompra): void {
    this.comprasService.precios(s.insumo_id).subscribe({
      next: (precios) => this.comparandoInsumo.set({ nombre: s.nombre, precios }),
      error: () => this.comparandoInsumo.set({ nombre: s.nombre, precios: [] }),
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
