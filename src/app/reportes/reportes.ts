// =============================================================================
// reportes/reportes.ts — REPORTE CONSOLIDADO (RF-26, Sprint 4 oficial)
// =============================================================================
// Pantalla "Reportes". Solo administrador y encargado (información
// financiera y de personal, RNF-03 — mismo criterio que Ventas de hoy,
// Mermas y Caja). Un filtro de fecha opcional (desde/hasta, combinable);
// sin filtros se ve el resumen de TODO el histórico, mismo patrón que
// mermas.ts. Todo el cálculo vive en el servidor (routes/reportes.js) —
// esta pantalla solo pinta lo que ya le llega calculado.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ReportesService, ResumenReportes } from '../core/reportes';
import { ThemeService } from '../core/theme';

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que usa todo el
// backend y asistencias.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class ReportesComponent implements OnInit {
  resumen = signal<ResumenReportes | null>(null);
  cargando = signal(true);
  error = signal('');

  filtroDesde = signal('');
  filtroHasta = signal('');

  hayFiltros = computed(() => !!this.filtroDesde() || !!this.filtroHasta());

  private consulta?: Subscription;

  constructor(
    private reportesService: ReportesService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarResumen();
  }

  cargarResumen(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja y lenta no debe pisar el resultado actual
    // (mismo criterio que ya usa mermas.ts/caja.ts con sus filtros de fecha).
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');

    this.consulta = this.reportesService
      .obtenerResumen({ desde: this.filtroDesde(), hasta: this.filtroHasta() })
      .subscribe({
        next: (resumen) => {
          this.resumen.set(resumen);
          this.cargando.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
              : error.error?.error || 'No se pudo generar el reporte.',
          );
          this.cargando.set(false);
        },
      });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarResumen();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarResumen();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.cargarResumen();
  }

  // RF-26 ("por día, semana y mes"): accesos rápidos que llenan desde/hasta
  // sin tener que teclear el rango a mano.
  seleccionarHoy(): void {
    const hoy = formatoFechaLocal(new Date());
    this.filtroDesde.set(hoy);
    this.filtroHasta.set(hoy);
    this.cargarResumen();
  }

  seleccionarSemana(): void {
    const hoy = new Date();
    // Lunes de esta semana: getDay() da 0=domingo..6=sábado; se retrocede
    // al lunes más reciente (domingo retrocede 6 días, no 1).
    const diasDesdeElLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeElLunes);
    this.filtroDesde.set(formatoFechaLocal(lunes));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarResumen();
  }

  seleccionarMes(): void {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.filtroDesde.set(formatoFechaLocal(primerDia));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarResumen();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
