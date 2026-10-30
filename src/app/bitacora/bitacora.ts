// =============================================================================
// bitacora/bitacora.ts — BITÁCORA DE AUDITORÍA (2026-10-30)
// =============================================================================
// Pantalla "Bitácora". Solo administrador. De solo lectura — las filas las
// escribe el propio backend en cada acción de alto riesgo (ver
// core/bitacora.ts y utils/bitacora.js). Filtros de fecha (con los mismos
// accesos rápidos Hoy/Esta semana/Este mes que ya usan Reportes/Nómina/
// Gastos) + chips de tipo de acción. Sin filtros, las últimas 200 — nunca
// "todo el histórico" como mermas/ventas, porque esta tabla crece con cada
// inicio de sesión del día a día.
// =============================================================================
import { Component, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { AccionBitacora, BitacoraService, EntradaBitacora } from '../core/bitacora';
import { ThemeService } from '../core/theme';

const ETIQUETA_ACCION: Record<AccionBitacora, string> = {
  inicio_sesion: 'Inicio de sesión',
  eliminar_historial: 'Eliminar historial',
  eliminar_usuario: 'Eliminar usuario',
  cancelar_venta: 'Cancelar venta',
  retiro_caja: 'Retiro de caja',
  eliminar_venta_especial: 'Eliminar venta especial',
};

const ACCIONES: { valor: AccionBitacora; etiqueta: string }[] = [
  { valor: 'inicio_sesion', etiqueta: 'Inicio de sesión' },
  { valor: 'eliminar_historial', etiqueta: 'Eliminar historial' },
  { valor: 'eliminar_usuario', etiqueta: 'Eliminar usuario' },
  { valor: 'cancelar_venta', etiqueta: 'Cancelar venta' },
  { valor: 'retiro_caja', etiqueta: 'Retiro de caja' },
  { valor: 'eliminar_venta_especial', etiqueta: 'Eliminar venta especial' },
];

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString() (mismo criterio que
// reportes.ts/nomina.ts/historial-ventas.ts/gastos.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

@Component({
  selector: 'app-bitacora',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './bitacora.html',
  styleUrl: './bitacora.css',
})
export class BitacoraComponent implements OnInit {
  readonly acciones = ACCIONES;

  entradas = signal<EntradaBitacora[]>([]);
  cargando = signal(true);
  error = signal('');

  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroAccion = signal<AccionBitacora | null>(null);

  hayFiltros = computed(
    () => !!this.filtroDesde() || !!this.filtroHasta() || !!this.filtroAccion(),
  );

  private consulta?: Subscription;

  constructor(
    private bitacoraService: BitacoraService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarBitacora();
  }

  cargarBitacora(): void {
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');
    this.consulta = this.bitacoraService
      .listar({
        desde: this.filtroDesde(),
        hasta: this.filtroHasta(),
        accion: this.filtroAccion(),
      })
      .subscribe({
        next: (entradas) => {
          this.entradas.set(entradas);
          this.cargando.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
              : error.error?.error || 'No se pudo cargar la bitácora.',
          );
          this.cargando.set(false);
        },
      });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarBitacora();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarBitacora();
  }

  seleccionarAccion(accion: AccionBitacora | null): void {
    this.filtroAccion.set(accion);
    this.cargarBitacora();
  }

  seleccionarHoy(): void {
    const hoy = formatoFechaLocal(new Date());
    this.filtroDesde.set(hoy);
    this.filtroHasta.set(hoy);
    this.cargarBitacora();
  }

  seleccionarSemana(): void {
    const hoy = new Date();
    const diasDesdeElLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeElLunes);
    this.filtroDesde.set(formatoFechaLocal(lunes));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarBitacora();
  }

  seleccionarMes(): void {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.filtroDesde.set(formatoFechaLocal(primerDia));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarBitacora();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroAccion.set(null);
    this.cargarBitacora();
  }

  etiquetaAccion(accion: AccionBitacora): string {
    return ETIQUETA_ACCION[accion] ?? accion;
  }

  // Las acciones destructivas resaltan en rojo en la lista (mismo lenguaje
  // de peligro que el resto de la app); inicio de sesión es informativo.
  esAccionDeRiesgo(accion: AccionBitacora): boolean {
    return accion !== 'inicio_sesion';
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
