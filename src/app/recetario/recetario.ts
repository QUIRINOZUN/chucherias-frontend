// =============================================================================
// recetario/recetario.ts — GESTIÓN DEL RECETARIO (insumos por variante)
// =============================================================================
// Pantalla "Recetario". Solo administrador y encargado (igual que Inventario
// — es información de negocio/cocina, no operación de mostrador).
//
// QUÉ HACE
//   - Lista las variantes del menú agrupadas por categoría → producto (igual
//     orden que ya trae GET /api/productos), cada una con una insignia de
//     cuántos insumos lleva su receta, o "Sin receta" si todavía no tiene.
//   - Un buscador por texto filtra por nombre de producto o de variante
//     (99 variantes en una sola lista plana sería difícil de navegar, igual
//     razón que ya resolvió inventario.ts agrupando por categoría).
//   - Tocar una variante abre un formulario (ventana emergente) con sus
//     líneas de receta (insumo + cantidad); se puede agregar o quitar líneas
//     y "Guardar receta" reemplaza TODA la receta de esa variante de una vez
//     (igual patrón de reemplazo completo que ya usa horarios.ts).
//   - La unidad de cada línea es SIEMPRE la unidad base del insumo elegido
//     (se autocompleta y no se puede editar): el servidor nunca convierte
//     unidades al descontar inventario (ver utils/inventarioOrden.js), así
//     que permitir otra unidad aquí produciría un descuento mal escalado en
//     silencio.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ThemeService } from '../core/theme';
import { LineaRecetaForm, RecetasService, VarianteConReceta } from '../core/recetas';
import { Insumo, InsumosService } from '../core/insumos';

// Línea de receta tal como vive en el formulario (antes de guardarse).
interface LineaFormulario {
  insumo_id: number | null;
  cantidad: number | null;
  unidad_medida: string;
}

interface GrupoProducto {
  producto_id: number;
  producto_nombre: string;
  variantes: VarianteConReceta[];
}

interface GrupoCategoria {
  categoria: string;
  productos: GrupoProducto[];
}

@Component({
  selector: 'app-recetario',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './recetario.html',
  styleUrl: './recetario.css',
})
export class RecetarioComponent implements OnInit {
  variantes = signal<VarianteConReceta[]>([]);
  insumos = signal<Insumo[]>([]);
  cargando = signal(true);
  error = signal('');
  busqueda = signal('');

  totalConReceta = computed(() => this.variantes().filter((v) => v.tiene_receta).length);
  totalSinReceta = computed(() => this.variantes().length - this.totalConReceta());

  // Solo las variantes que calzan con el texto buscado (por producto o por
  // variante); sin texto, se muestran todas.
  variantesVisibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    if (!texto) {
      return this.variantes();
    }
    return this.variantes().filter(
      (v) =>
        v.producto_nombre.toLowerCase().includes(texto) ||
        v.variante_nombre.toLowerCase().includes(texto),
    );
  });

  // Agrupa las variantes visibles por categoría → producto, respetando el
  // orden en que ya llegan del servidor (categoría, producto, precio).
  grupos = computed<GrupoCategoria[]>(() => {
    const grupos: GrupoCategoria[] = [];
    for (const variante of this.variantesVisibles()) {
      let grupo = grupos.find((g) => g.categoria === variante.categoria);
      if (!grupo) {
        grupo = { categoria: variante.categoria, productos: [] };
        grupos.push(grupo);
      }
      let producto = grupo.productos.find((p) => p.producto_id === variante.producto_id);
      if (!producto) {
        producto = {
          producto_id: variante.producto_id,
          producto_nombre: variante.producto_nombre,
          variantes: [],
        };
        grupo.productos.push(producto);
      }
      producto.variantes.push(variante);
    }
    return grupos;
  });

  // ---- Editor de receta (ventana emergente) ----
  varianteEditando = signal<VarianteConReceta | null>(null);
  lineasForm = signal<LineaFormulario[]>([]);
  cargandoReceta = signal(false);
  guardando = signal(false);
  errorForm = signal('');

  constructor(
    private recetasService: RecetasService,
    private insumosService: InsumosService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarVariantes();
    this.cargarInsumos();
  }

  cargarVariantes(): void {
    this.cargando.set(true);
    this.recetasService.listarVariantes().subscribe({
      next: (variantes) => {
        this.variantes.set(variantes);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el recetario.');
        this.cargando.set(false);
      },
    });
  }

  cargarInsumos(): void {
    this.insumosService.listar().subscribe({
      next: (insumos) => this.insumos.set(insumos),
      error: () => {
        // El selector de insumos del formulario simplemente queda vacío; el
        // resto de la pantalla sigue funcionando.
      },
    });
  }

  // ---- Editor ----

  abrirEditor(variante: VarianteConReceta): void {
    this.varianteEditando.set(variante);
    this.errorForm.set('');
    this.cargandoReceta.set(true);
    this.lineasForm.set([]);

    this.recetasService.obtenerReceta(variante.variante_id).subscribe({
      next: (lineas) => {
        this.lineasForm.set(
          lineas.map((l) => ({
            insumo_id: l.insumo_id,
            cantidad: l.cantidad,
            unidad_medida: l.unidad_medida,
          })),
        );
        this.cargandoReceta.set(false);
      },
      error: () => {
        this.errorForm.set('No se pudo cargar la receta de esta variante.');
        this.cargandoReceta.set(false);
      },
    });
  }

  cerrarEditor(): void {
    this.varianteEditando.set(null);
  }

  agregarLinea(): void {
    this.lineasForm.update((lineas) => [
      ...lineas,
      { insumo_id: null, cantidad: null, unidad_medida: '' },
    ]);
  }

  quitarLinea(index: number): void {
    this.lineasForm.update((lineas) => lineas.filter((_, i) => i !== index));
  }

  // Los insumos ya elegidos en OTRA línea no se ofrecen de nuevo (evita
  // repetir el mismo insumo dos veces); la propia línea sigue viendo su
  // insumo actual entre las opciones.
  insumosDisponiblesPara(index: number): Insumo[] {
    const usadosEnOtras = new Set(
      this.lineasForm()
        .filter((_, i) => i !== index)
        .map((l) => l.insumo_id)
        .filter((id): id is number => id !== null),
    );
    return this.insumos().filter((i) => !usadosEnOtras.has(i.id));
  }

  // Al elegir insumo se autocompleta su unidad base — ver nota del
  // encabezado sobre por qué no se deja editar.
  actualizarInsumoLinea(index: number, insumoId: number | null): void {
    const insumo = insumoId ? this.insumos().find((i) => i.id === insumoId) : undefined;
    this.lineasForm.update((lineas) =>
      lineas.map((linea, i) =>
        i === index
          ? { ...linea, insumo_id: insumoId, unidad_medida: insumo?.unidad_medida ?? '' }
          : linea,
      ),
    );
  }

  actualizarCantidadLinea(index: number, valor: string): void {
    const cantidad = valor === '' ? null : Number(valor);
    this.lineasForm.update((lineas) =>
      lineas.map((linea, i) =>
        i === index ? { ...linea, cantidad: Number.isFinite(cantidad) ? cantidad : null } : linea,
      ),
    );
  }

  puedeGuardar(): boolean {
    if (this.guardando() || this.cargandoReceta()) {
      return false;
    }
    return this.lineasForm().every(
      (l) => l.insumo_id !== null && l.cantidad !== null && l.cantidad > 0,
    );
  }

  guardar(): void {
    const variante = this.varianteEditando();
    if (!variante || !this.puedeGuardar()) {
      return;
    }
    this.guardando.set(true);
    this.errorForm.set('');

    const payload: LineaRecetaForm[] = this.lineasForm().map((l) => ({
      insumo_id: l.insumo_id!,
      cantidad: l.cantidad!,
      unidad_medida: l.unidad_medida,
    }));

    this.recetasService.guardarReceta(variante.variante_id, payload).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarEditor();
        this.cargarVariantes();
      },
      error: (error: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorForm.set(error.error?.error || 'No se pudo guardar la receta.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
