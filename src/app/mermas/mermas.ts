// =============================================================================
// mermas/mermas.ts — REPORTE CONSOLIDADO DE MERMAS
// =============================================================================
// Pantalla "Mermas". Solo administrador y encargado (información financiera,
// RNF-03). Antes de esta pantalla, las mermas solo se veían dispersas: las de
// PRODUCTO (venta cancelada) en el badge de cada venta en "Ventas de hoy", y
// las de INSUMO (manual, o por no rescatar algo al cancelar en 'preparando')
// en el historial de movimientos de cada insumo, uno por uno, en Inventario.
// Aquí se consultan juntas, con filtros de fecha y tipo.
//
// Sin filtros por default se ve TODO el historial (mismo criterio que el
// historial de cortes de caja) — los filtros de fecha/tipo lo acotan.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { FiltrosMermas, Merma, MermasService, TipoMerma } from '../core/mermas';
import { ThemeService } from '../core/theme';

@Component({
  selector: 'app-mermas',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './mermas.html',
  styleUrl: './mermas.css',
})
export class MermasComponent implements OnInit {
  mermas = signal<Merma[]>([]);
  cargando = signal(true);
  error = signal('');

  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroTipo = signal<TipoMerma | null>(null);

  hayFiltrosDeFecha = computed(() => !!this.filtroDesde() || !!this.filtroHasta());

  // Totales de lo que está filtrado en pantalla (no de todo el histórico).
  totalMermas = computed(() => this.mermas().length);
  valorTotalPerdido = computed(() =>
    this.mermas().reduce(
      (suma, m) => suma + (m.valor_total != null ? Number(m.valor_total) : 0),
      0,
    ),
  );
  totalProducto = computed(() => this.mermas().filter((m) => m.tipo === 'producto').length);
  totalInsumo = computed(() => this.mermas().filter((m) => m.tipo === 'insumo').length);

  private consulta?: Subscription;

  constructor(
    private mermasService: MermasService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarMermas();
  }

  cargarMermas(): void {
    // Si el usuario cambia otro filtro antes de que responda la consulta
    // anterior, se cancela: de lo contrario una respuesta vieja y lenta
    // podría llegar después y pisar el resultado de los filtros actuales.
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');

    const filtros: FiltrosMermas = {
      desde: this.filtroDesde(),
      hasta: this.filtroHasta(),
      tipo: this.filtroTipo(),
    };

    this.consulta = this.mermasService.listar(filtros).subscribe({
      next: (mermas) => {
        this.mermas.set(mermas);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : error.error?.error || 'No se pudieron cargar las mermas.',
        );
        this.cargando.set(false);
      },
    });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarMermas();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarMermas();
  }

  cambiarTipo(valor: string): void {
    this.filtroTipo.set(valor === '' ? null : (valor as TipoMerma));
    this.cargarMermas();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroTipo.set(null);
    this.cargarMermas();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
