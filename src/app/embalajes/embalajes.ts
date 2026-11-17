// =============================================================================
// embalajes/embalajes.ts — EMBALAJES Y DECORACIONES (2026-11-17)
// =============================================================================
// CRUD del material para empacar, dentro del módulo de Inventario (se abre desde su botón
// "Embalajes"). Dos listas separadas: las de ventas normales (charolas, cajas de pizza...) y las
// de ventas especiales (embalaje y decoración). Cada uno es un insumo: tiene existencia, costo,
// mínimo y movimientos (entrada, ajuste, merma). Solo administrador y encargado.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { ClaseEmbalaje, Embalaje, EmbalajesService, UsoEmbalaje } from '../core/embalajes';
import { InsumosService } from '../core/insumos';
import { ThemeService } from '../core/theme';

type TipoMovimiento = 'entrada' | 'ajuste' | 'merma';

@Component({
  selector: 'app-embalajes',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FocoDialogoDirective],
  templateUrl: './embalajes.html',
  styleUrl: './embalajes.css',
})
export class EmbalajesComponent implements OnInit {
  uso = signal<UsoEmbalaje>('venta');
  todos = signal<Embalaje[]>([]);
  cargando = signal(true);
  error = signal('');

  // Los de la pestaña activa.
  lista = computed(() => this.todos().filter((e) => e.uso === this.uso()));
  cuenta = computed(() => ({
    venta: this.todos().filter((e) => e.uso === 'venta').length,
    especial: this.todos().filter((e) => e.uso === 'especial').length,
  }));

  // ---- Alta / edición ----
  form = signal<{ id: number | null; nombre: string; unidad: string; clase: ClaseEmbalaje } | null>(
    null,
  );
  minimoForm = signal('');
  costoForm = signal('');
  guardando = signal(false);
  errorForm = signal('');

  // ---- Movimiento de inventario ----
  movimiento = signal<{ embalaje: Embalaje; tipo: TipoMovimiento } | null>(null);
  cantidadMov = signal('');
  costoTotalMov = signal('');
  motivoMov = signal('');
  guardandoMov = signal(false);
  errorMov = signal('');

  // ---- Eliminar ----
  aEliminar = signal<Embalaje | null>(null);
  errorEliminar = signal('');

  constructor(
    private embalajesService: EmbalajesService,
    private insumosService: InsumosService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  volver(): void {
    this.router.navigate(['/inventario']);
  }

  cargar(): void {
    this.cargando.set(true);
    this.embalajesService.listar().subscribe({
      next: (l) => {
        this.todos.set(l);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los embalajes.');
        this.cargando.set(false);
      },
    });
  }

  elegirUso(u: UsoEmbalaje): void {
    this.uso.set(u);
  }

  etiquetaClase(e: Embalaje): string {
    return e.clase === 'decoracion' ? 'Decoración' : 'Embalaje';
  }

  // ===================== Alta / edición =====================
  abrirForm(e?: Embalaje): void {
    this.errorForm.set('');
    this.minimoForm.set(e?.cantidad_minima ? String(e.cantidad_minima) : '');
    this.costoForm.set(e?.costo_unitario != null ? String(e.costo_unitario) : '');
    this.form.set({
      id: e?.id ?? null,
      nombre: e?.nombre ?? '',
      unidad: e?.unidad_medida ?? 'pza',
      clase: e?.clase ?? 'embalaje',
    });
  }

  campo(campo: 'nombre' | 'unidad', texto: string): void {
    this.form.update((f) => (f ? { ...f, [campo]: texto } : f));
  }

  elegirClase(c: ClaseEmbalaje): void {
    this.form.update((f) => (f ? { ...f, clase: c } : f));
  }

  guardar(): void {
    const f = this.form();
    if (!f) return;
    if (!f.nombre.trim()) {
      this.errorForm.set('Escribe el nombre.');
      return;
    }
    const costo = this.costoForm().trim();
    if (costo !== '' && (!Number.isFinite(Number(costo)) || Number(costo) < 0)) {
      this.errorForm.set('El costo no es válido.');
      return;
    }
    const datos = {
      nombre: f.nombre.trim(),
      unidad_medida: f.unidad.trim() || 'pza',
      cantidad_minima: Number(this.minimoForm()) || 0,
      costo_unitario: costo === '' ? null : Number(costo),
      ...(this.uso() === 'especial' ? { clase: f.clase } : {}),
    };
    this.guardando.set(true);
    const peticion: Observable<unknown> =
      f.id === null
        ? this.embalajesService.crear({ ...datos, uso: this.uso() })
        : this.embalajesService.editar(f.id, datos);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.form.set(null);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorForm.set(e.error?.error || 'No se pudo guardar.');
      },
    });
  }

  // ===================== Movimientos =====================
  abrirMovimiento(embalaje: Embalaje, tipo: TipoMovimiento): void {
    this.errorMov.set('');
    this.cantidadMov.set('');
    this.costoTotalMov.set('');
    this.motivoMov.set('');
    this.movimiento.set({ embalaje, tipo });
  }

  tituloMovimiento(tipo: TipoMovimiento): string {
    return tipo === 'entrada'
      ? 'Registrar entrada'
      : tipo === 'merma'
        ? 'Registrar merma'
        : 'Registrar ajuste';
  }

  // Costo por pieza que se guardaría con la compra: total pagado entre lo que llegó.
  costoPorPieza = computed(() => {
    const cant = Number(this.cantidadMov());
    const total = Number(this.costoTotalMov());
    return cant > 0 && total > 0 ? Math.round((total / cant) * 1e6) / 1e6 : null;
  });

  guardarMovimiento(): void {
    const m = this.movimiento();
    if (!m) return;
    const escrita = Number(this.cantidadMov());
    if (this.cantidadMov().trim() === '' || !Number.isFinite(escrita) || escrita < 0) {
      this.errorMov.set(
        m.tipo === 'ajuste'
          ? 'Escribe la cantidad real que hay ahora.'
          : 'Escribe una cantidad mayor a cero.',
      );
      return;
    }
    // En un ajuste se captura lo que HAY de verdad; el servidor recibe la diferencia contra el sistema.
    const cantidad =
      m.tipo === 'ajuste' ? Math.round((escrita - m.embalaje.existencia) * 100) / 100 : escrita;
    if (cantidad === 0) {
      this.errorMov.set(
        m.tipo === 'ajuste'
          ? 'Ya coincide con lo que dice el sistema.'
          : 'Escribe una cantidad mayor a cero.',
      );
      return;
    }
    const motivo = this.motivoMov().trim();
    if (m.tipo !== 'entrada' && !motivo) {
      this.errorMov.set('El motivo es obligatorio.');
      return;
    }
    this.guardandoMov.set(true);
    const id = m.embalaje.id;
    const peticion: Observable<unknown> =
      m.tipo === 'entrada'
        ? this.insumosService.registrarEntrada(id, cantidad, motivo, this.costoPorPieza())
        : m.tipo === 'merma'
          ? this.insumosService.registrarMerma(id, cantidad, motivo)
          : this.insumosService.registrarAjuste(id, cantidad, motivo);
    peticion.subscribe({
      next: () => {
        this.guardandoMov.set(false);
        this.movimiento.set(null);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.guardandoMov.set(false);
        this.errorMov.set(e.error?.error || 'No se pudo registrar.');
      },
    });
  }

  // ===================== Eliminar =====================
  confirmarEliminar(): void {
    const e = this.aEliminar();
    if (!e) return;
    this.embalajesService.eliminar(e.id).subscribe({
      next: () => {
        this.aEliminar.set(null);
        this.cargar();
      },
      error: (err: HttpErrorResponse) =>
        this.errorEliminar.set(err.error?.error || 'No se pudo eliminar.'),
    });
  }
}
