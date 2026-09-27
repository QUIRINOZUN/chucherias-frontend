// =============================================================================
// historial-ventas/historial-ventas.ts — VENTAS DEL DÍA Y CANCELACIÓN (RF-03)
// =============================================================================
// Pantalla "Ventas de hoy". Solo administrador y encargado (información
// financiera, RNF-03). Muestra:
//   - El total del día (solo ventas completadas).
//   - Cada venta con sus productos, método de pago, tipo de entrega y estado.
//   - Un botón para cancelar una venta completada, con motivo opcional.
//
// FLUJO DE CANCELACIÓN
//   1. "Cancelar esta venta" abre un panel en esa tarjeta (cancelandoId).
//   2. Se escribe el motivo (opcional) y se confirma.
//   3. El servidor marca la venta y su orden como canceladas y guarda quién y
//      cuándo. La pantalla recarga la lista para reflejarlo.
// =============================================================================
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
  // Ventas del día tal como las devolvió el servidor.
  ventas = signal<VentaHistorial[]>([]);
  cargando = signal(true);
  error = signal('');

  // id de la venta cuyo panel de cancelación está abierto (null = ninguno).
  cancelandoId = signal<number | null>(null);
  motivoCancelacion = signal('');
  procesandoCancelacion = signal(false);

  // Suma de las ventas COMPLETADAS; las canceladas no cuentan, igual que en el
  // corte de caja.
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

  // Al abrir la pantalla se cargan las ventas de hoy.
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
        // status 0 = sin respuesta (sin Internet o servidor gratuito dormido).
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : 'No se pudieron cargar las ventas.',
        );
        this.cargando.set(false);
      },
    });
  }

  // Abre el panel de cancelación de UNA venta y limpia el motivo anterior.
  abrirCancelacion(venta: VentaHistorial): void {
    this.cancelandoId.set(venta.id);
    this.motivoCancelacion.set('');
  }

  // Cierra el panel sin cancelar nada ("Volver").
  cerrarCancelacion(): void {
    this.cancelandoId.set(null);
  }

  // Envía la cancelación al servidor y, si sale bien, recarga la lista para
  // que la venta aparezca como cancelada con su auditoría.
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
