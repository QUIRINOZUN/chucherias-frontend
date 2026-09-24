import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ThemeService } from '../core/theme';
import { VentaHistorial, VentasService } from '../core/ventas';

@Component({
  selector: 'app-historial-ventas',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './historial-ventas.html',
  styleUrl: './historial-ventas.css',
})
export class HistorialVentasComponent implements OnInit {
  ventas = signal<VentaHistorial[]>([]);
  cargando = signal(true);
  error = signal('');

  cancelandoId = signal<number | null>(null);
  motivoCancelacion = signal('');
  procesandoCancelacion = signal(false);

  totalDelDia = computed(() =>
    this.ventas()
      .filter((v) => v.estado === 'completada')
      .reduce((suma, v) => suma + Number(v.total), 0),
  );

  constructor(
    private ventasService: VentasService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarVentas();
  }

  cargarVentas(): void {
    this.cargando.set(true);
    this.ventasService.listar().subscribe({
      next: (ventas) => {
        this.ventas.set(ventas);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : 'No se pudieron cargar las ventas.',
        );
        this.cargando.set(false);
      },
    });
  }

  abrirCancelacion(venta: VentaHistorial): void {
    this.cancelandoId.set(venta.id);
    this.motivoCancelacion.set('');
  }

  cerrarCancelacion(): void {
    this.cancelandoId.set(null);
  }

  confirmarCancelacion(venta: VentaHistorial): void {
    this.procesandoCancelacion.set(true);
    this.ventasService.cancelar(venta.id, this.motivoCancelacion().trim()).subscribe({
      next: () => {
        this.procesandoCancelacion.set(false);
        this.cancelandoId.set(null);
        this.cargarVentas();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoCancelacion.set(false);
        this.error.set(error.error?.error || 'No se pudo cancelar la venta.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
