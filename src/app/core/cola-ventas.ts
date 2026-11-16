// =============================================================================
// core/cola-ventas.ts — VENTAS PENDIENTES POR FALTA DE INTERNET (2026-11-16)
// =============================================================================
// Si al cobrar no hay respuesta del servidor (se cayó el internet), la venta se
// guarda en este dispositivo (localStorage) y se reenvía sola cuando vuelve la
// conexión: al evento `online`, cada 30 s y al abrir el POS. Cada venta lleva su
// `clave` única: si el primer intento sí llegó al servidor pero la respuesta se
// perdió, el reintento recibe la venta ya registrada en vez de duplicarla (ver
// routes/ventas.js, migración 2026-11-16_ventas_idempotencia).
//
// QUÉ NO HACE (a propósito): solo cubre COBRAR durante un corte. Inventario,
// caja y reportes siguen necesitando servidor; la venta no tiene folio ni
// ticket hasta que se envía. Una venta que el servidor RECHAZA (error 4xx, ej.
// producto desactivado) no se reintenta en bucle: queda marcada con su motivo
// para que alguien la revise y la capture a mano.
// =============================================================================
import { Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NuevaVenta, VentasService } from './ventas';

const LLAVE = 'ventasPendientes';
const INTERVALO_MS = 30 * 1000;

export interface VentaPendiente {
  clave: string;
  payload: NuevaVenta;
  // Total estimado al cobrar, solo para mostrarlo en el aviso.
  total: number;
  fecha: string;
  // Motivo si el servidor la rechazó (no se reintenta sola).
  rechazo?: string;
}

@Injectable({ providedIn: 'root' })
export class ColaVentasService {
  pendientes = signal<VentaPendiente[]>(this.leer());
  enviando = signal(false);

  constructor(private ventasService: VentasService) {
    window.addEventListener('online', () => void this.enviarPendientes());
    setInterval(() => void this.enviarPendientes(), INTERVALO_MS);
    void this.enviarPendientes();
  }

  private leer(): VentaPendiente[] {
    try {
      const datos = JSON.parse(localStorage.getItem(LLAVE) ?? '[]');
      return Array.isArray(datos) ? datos : [];
    } catch {
      return [];
    }
  }

  private guardar(lista: VentaPendiente[]): void {
    try {
      localStorage.setItem(LLAVE, JSON.stringify(lista));
    } catch {
      // Sin almacenamiento disponible: la cola sigue viva en memoria mientras no se recargue.
    }
    this.pendientes.set(lista);
  }

  // Cuántas ventas esperan envío (sin contar las rechazadas).
  porEnviar(): number {
    return this.pendientes().filter((v) => !v.rechazo).length;
  }

  rechazadas(): VentaPendiente[] {
    return this.pendientes().filter((v) => !!v.rechazo);
  }

  agregar(payload: NuevaVenta, total: number): void {
    if (!payload.clave) return;
    if (this.pendientes().some((v) => v.clave === payload.clave)) return;
    this.guardar([
      ...this.pendientes(),
      { clave: payload.clave, payload, total, fecha: new Date().toISOString() },
    ]);
  }

  // Descarta una venta rechazada (después de capturarla a mano o de decidir que no vale).
  descartar(clave: string): void {
    this.guardar(this.pendientes().filter((v) => v.clave !== clave));
  }

  // Reenvía en orden; se detiene en cuanto no hay conexión para no perder el orden.
  async enviarPendientes(): Promise<void> {
    if (this.enviando() || this.porEnviar() === 0 || !navigator.onLine) return;
    this.enviando.set(true);
    try {
      for (const venta of this.pendientes().filter((v) => !v.rechazo)) {
        try {
          await firstValueFrom(this.ventasService.registrarVenta(venta.payload));
          this.guardar(this.pendientes().filter((v) => v.clave !== venta.clave));
        } catch (error) {
          const e = error as HttpErrorResponse;
          if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408) {
            // El servidor la entendió y la rechazó: no se reintenta en bucle.
            const motivo = e.error?.error || 'El servidor rechazó la venta.';
            this.guardar(
              this.pendientes().map((v) =>
                v.clave === venta.clave ? { ...v, rechazo: motivo } : v,
              ),
            );
            continue;
          }
          break; // sin conexión o error del servidor: se reintenta luego
        }
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
