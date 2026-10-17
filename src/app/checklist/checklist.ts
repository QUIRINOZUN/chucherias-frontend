// =============================================================================
// checklist/checklist.ts — CHECKLIST DE APERTURA/CIERRE (2026-10-16)
// =============================================================================
// Pedido explícito de la titular en la entrevista: "El checklist de
// apertura y cierre (gas, luces, limpieza); aunque parece sencillo, es
// clave para la operación diaria." Visible a TODO rol operativo (cualquiera
// puede abrir/cerrar, según la entrevista) — solo administrador/encargado
// pueden personalizar el catálogo de pasos (pestaña "Gestionar").
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  ChecklistItem,
  ChecklistItemHoy,
  ChecklistService,
  MarcaHistorial,
  TipoChecklist,
} from '../core/checklist';
import { AuthService } from '../core/auth';
import { ThemeService } from '../core/theme';

type Pestana = 'apertura' | 'cierre' | 'historial' | 'gestion';

// Arreglo tipado para iterar en la plantilla (ver seccion-gestion-checklist)
// sin que Angular infiera string[] de un literal inline.
const TIPOS: TipoChecklist[] = ['apertura', 'cierre'];

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './checklist.html',
  styleUrl: './checklist.css',
})
export class ChecklistComponent implements OnInit {
  // Expuesto a la plantilla para iterar los 2 tipos en la pestaña "Gestionar".
  tipos = TIPOS;

  pestanaActiva = signal<Pestana>('apertura');

  itemsHoy = signal<Record<TipoChecklist, ChecklistItemHoy[]>>({ apertura: [], cierre: [] });
  cargando = signal(true);
  error = signal('');
  procesandoItemId = signal<number | null>(null);

  // Solo se lee dentro de la plantilla cuando pestanaActiva() ya es
  // 'apertura' o 'cierre' (ver el @if que envuelve esa sección) — nunca con
  // 'gestion' puesto, aunque el tipo lo permita en teoría.
  tipoActivo = computed(() => this.pestanaActiva() as TipoChecklist);

  esGestor = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return rol === 'administrador' || rol === 'encargado';
  });

  // ---- Pestaña "Gestionar" (catálogo completo, solo administrador/encargado) ----
  itemsGestion = signal<ChecklistItem[]>([]);
  cargandoGestion = signal(false);
  nuevoTipoForm = signal<TipoChecklist>('apertura');
  nuevaDescripcionForm = signal('');
  creandoItem = signal(false);
  errorGestion = signal('');

  // ---- Pestaña "Historial" (quién marcó qué y cuándo, solo administrador/
  // encargado — ver routes/checklist.js) ----
  historialMarcas = signal<MarcaHistorial[]>([]);
  cargandoHistorial = signal(false);
  errorHistorial = signal('');
  filtroHistorialDesde = signal('');
  filtroHistorialHasta = signal('');
  filtroHistorialTipo = signal<TipoChecklist | null>(null);
  hayFiltrosHistorial = computed(
    () =>
      !!this.filtroHistorialDesde() ||
      !!this.filtroHistorialHasta() ||
      !!this.filtroHistorialTipo(),
  );
  private consultaHistorial?: Subscription;

  constructor(
    private checklistService: ChecklistService,
    private authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarHoy('apertura');
    this.cargarHoy('cierre');
  }

  cambiarPestana(pestana: Pestana): void {
    this.pestanaActiva.set(pestana);
    if (pestana === 'gestion' && this.itemsGestion().length === 0) {
      this.cargarGestion();
    }
    if (pestana === 'historial' && this.historialMarcas().length === 0) {
      this.cargarHistorial();
    }
  }

  private cargarHoy(tipo: TipoChecklist): void {
    this.cargando.set(true);
    this.error.set('');
    this.checklistService.obtenerHoy(tipo).subscribe({
      next: (items) => {
        this.itemsHoy.update((actual) => ({ ...actual, [tipo]: items }));
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(error.error?.error || 'No se pudo cargar el checklist.');
        this.cargando.set(false);
      },
    });
  }

  itemsDe(tipo: TipoChecklist): ChecklistItemHoy[] {
    return this.itemsHoy()[tipo];
  }

  // Cuántos de ese tipo ya se marcaron hoy (para el resumen "3 de 5").
  contarMarcados(tipo: TipoChecklist): number {
    return this.itemsDe(tipo).filter((i) => i.marcado).length;
  }

  alternarMarca(item: ChecklistItemHoy, tipo: TipoChecklist): void {
    this.procesandoItemId.set(item.id);
    const accion = item.marcado
      ? this.checklistService.desmarcar(item.id)
      : this.checklistService.marcar(item.id);

    accion.subscribe({
      next: () => {
        this.procesandoItemId.set(null);
        this.cargarHoy(tipo);
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoItemId.set(null);
        this.error.set(error.error?.error || 'No se pudo actualizar el paso.');
      },
    });
  }

  // ===========================================================================
  // GESTIÓN DEL CATÁLOGO (administrador/encargado)
  // ===========================================================================

  cargarGestion(): void {
    this.cargandoGestion.set(true);
    this.checklistService.obtenerItems(undefined, true).subscribe({
      next: (items) => {
        this.itemsGestion.set(items);
        this.cargandoGestion.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorGestion.set(error.error?.error || 'No se pudo cargar el catálogo.');
        this.cargandoGestion.set(false);
      },
    });
  }

  itemsGestionDe(tipo: TipoChecklist): ChecklistItem[] {
    return this.itemsGestion().filter((i) => i.tipo === tipo);
  }

  crearItem(): void {
    const descripcion = this.nuevaDescripcionForm().trim();
    if (!descripcion) {
      this.errorGestion.set('Escribe una descripción para el nuevo paso.');
      return;
    }
    this.creandoItem.set(true);
    this.errorGestion.set('');
    this.checklistService.crearItem({ tipo: this.nuevoTipoForm(), descripcion }).subscribe({
      next: () => {
        this.creandoItem.set(false);
        this.nuevaDescripcionForm.set('');
        this.cargarGestion();
        // Se recargan también las listas de "hoy" por si el paso nuevo
        // aplica al tipo que ya se estaba viendo.
        this.cargarHoy('apertura');
        this.cargarHoy('cierre');
      },
      error: (error: HttpErrorResponse) => {
        this.creandoItem.set(false);
        this.errorGestion.set(error.error?.error || 'No se pudo crear el paso.');
      },
    });
  }

  cambiarActivo(item: ChecklistItem): void {
    this.checklistService.editarItem(item.id, { activo: !item.activo }).subscribe({
      next: () => {
        this.cargarGestion();
        this.cargarHoy('apertura');
        this.cargarHoy('cierre');
      },
      error: (error: HttpErrorResponse) => {
        this.errorGestion.set(error.error?.error || 'No se pudo actualizar el paso.');
      },
    });
  }

  // ===========================================================================
  // HISTORIAL (quién marcó qué y cuándo — administrador/encargado)
  // ===========================================================================

  cargarHistorial(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior,
    // se cancela (mismo criterio que mermas.ts/caja.ts).
    this.consultaHistorial?.unsubscribe();
    this.cargandoHistorial.set(true);
    this.errorHistorial.set('');
    this.consultaHistorial = this.checklistService
      .obtenerHistorial({
        desde: this.filtroHistorialDesde(),
        hasta: this.filtroHistorialHasta(),
        tipo: this.filtroHistorialTipo() ?? undefined,
      })
      .subscribe({
        next: (marcas) => {
          this.historialMarcas.set(marcas);
          this.cargandoHistorial.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorHistorial.set(error.error?.error || 'No se pudo cargar el historial.');
          this.cargandoHistorial.set(false);
        },
      });
  }

  cambiarFiltroHistorialDesde(valor: string): void {
    this.filtroHistorialDesde.set(valor);
    this.cargarHistorial();
  }

  cambiarFiltroHistorialHasta(valor: string): void {
    this.filtroHistorialHasta.set(valor);
    this.cargarHistorial();
  }

  cambiarFiltroHistorialTipo(valor: string): void {
    this.filtroHistorialTipo.set(valor === '' ? null : (valor as TipoChecklist));
    this.cargarHistorial();
  }

  limpiarFiltrosHistorial(): void {
    this.filtroHistorialDesde.set('');
    this.filtroHistorialHasta.set('');
    this.filtroHistorialTipo.set(null);
    this.cargarHistorial();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
