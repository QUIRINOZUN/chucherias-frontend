// =============================================================================
// core/caja.ts — SERVICIO DE CAJA, CORTES Y MOVIMIENTOS (RF-04)
// =============================================================================
// Habla con /api/caja. Lo usan la pantalla de Corte de caja y el POS:
//   - obtenerResumen   → lo que el SISTEMA calcula que debería haber hoy
//                        (ventas + apertura + ingresos − retiros).
//   - registrarCorte   → guardar el corte (contado físicamente vs. sistema).
//   - obtenerHistorial → consultar cortes anteriores con filtros.
//   - registrarMovimiento → apertura (saldo inicial), ingreso (efectivo que
//     entra fuera de una venta) o retiro (solo administrador) de efectivo.
//   - obtenerRetirosPendientes / confirmarRetiro → el POS hace polling de
//     retiros sin confirmar y, al confirmarlos, imprime su comprobante.
//
// Permisos (los aplica el servidor): resumen, corte, apertura/ingreso →
// administrador, encargado y cajero; retiro → solo administrador; historial
// y GET /movimientos → solo administrador y encargado.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Lo que el sistema calculó para un día: ventas + movimientos de caja ya
// combinados en lo que debería haber físicamente (ver routes/caja.js).
export interface ResumenCaja {
  fecha: string;
  ventas_efectivo: number;
  apertura: number;
  ingresos_efectivo: number;
  retiros_efectivo: number;
  // Reembolsos a clientes por productos cancelados (ver routes/ventas.js,
  // PATCH /:id/cancelar) — resta del efectivo esperado igual que un retiro.
  reembolsos_efectivo: number;
  total_efectivo: number;
  total_transferencia: number;
  total_sistema: number;
}

// 'reembolso' no se crea con registrarMovimiento (el servidor lo rechaza por
// esa vía) — lo genera automáticamente la cancelación de una venta.
export type TipoMovimientoCaja = 'apertura' | 'ingreso' | 'retiro' | 'reembolso';

// Un movimiento de caja tal como lo devuelve el servidor. Los montos llegan
// como texto (NUMERIC de PostgreSQL).
export interface MovimientoCaja {
  id: number;
  tipo: TipoMovimientoCaja;
  monto: string;
  motivo: string | null;
  fecha: string;
  confirmado: boolean;
  responsable: string;
  confirmado_por_nombre?: string | null;
  fecha_confirmacion?: string | null;
}

// Cuerpo de POST /api/caja/corte: lo que la persona CONTÓ físicamente.
// El total del sistema NO se envía: lo recalcula el servidor.
export interface NuevoCorte {
  fecha?: string;
  turno?: string;
  total_efectivo_contado: number;
  total_transferencia_contado: number;
}

// Un corte guardado. Los montos llegan como texto (así devuelve PostgreSQL
// los NUMERIC). `total_efectivo` y `total_transferencia` son lo CONTADO;
// `total_sistema` es lo que esperaba el sistema; `diferencia` = contado - sistema.
export interface CorteCaja {
  id: number;
  // AAAA-MM-DD. El DatePipe de Angular trata una fecha sin hora como
  // fecha local, así que no se corre un día según la zona del navegador.
  fecha: string;
  turno: string | null;
  total_efectivo: string;
  total_transferencia: string;
  total_sistema: string;
  diferencia: string;
  responsable_id: number;
  responsable: string;
}

// Filtros opcionales y combinables del historial de cortes.
export interface FiltrosHistorial {
  desde?: string;
  hasta?: string;
  responsableId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/caja/resumen — sin `fecha`, el servidor usa el día actual del negocio.
  obtenerResumen(fecha?: string): Observable<ResumenCaja> {
    return this.http.get<ResumenCaja>(`${this.apiUrl}/caja/resumen`, {
      params: fecha ? { fecha } : {},
    });
  }

  // POST /api/caja/corte
  registrarCorte(datos: NuevoCorte): Observable<CorteCaja> {
    return this.http.post<CorteCaja>(`${this.apiUrl}/caja/corte`, datos);
  }

  // GET /api/caja/cortes — arma los parámetros solo con los filtros que
  // tienen valor; un filtro vacío simplemente no se envía.
  obtenerHistorial(filtros: FiltrosHistorial = {}): Observable<CorteCaja[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) {
      params['desde'] = filtros.desde;
    }
    if (filtros.hasta) {
      params['hasta'] = filtros.hasta;
    }
    if (filtros.responsableId != null) {
      params['responsable_id'] = String(filtros.responsableId);
    }
    return this.http.get<CorteCaja[]>(`${this.apiUrl}/caja/cortes`, { params });
  }

  // POST /api/caja/movimientos — apertura/ingreso: roles que usan el POS;
  // retiro: solo administrador (el servidor lo vuelve a exigir).
  registrarMovimiento(
    tipo: TipoMovimientoCaja,
    monto: number,
    motivo?: string,
  ): Observable<MovimientoCaja> {
    return this.http.post<MovimientoCaja>(`${this.apiUrl}/caja/movimientos`, {
      tipo,
      monto,
      motivo,
    });
  }

  // GET /api/caja/movimientos — historial del día, solo administrador/encargado.
  obtenerMovimientos(fecha?: string): Observable<MovimientoCaja[]> {
    return this.http.get<MovimientoCaja[]>(`${this.apiUrl}/caja/movimientos`, {
      params: fecha ? { fecha } : {},
    });
  }

  // GET /api/caja/retiros-pendientes — el POS hace polling de esto.
  obtenerRetirosPendientes(): Observable<MovimientoCaja[]> {
    return this.http.get<MovimientoCaja[]>(`${this.apiUrl}/caja/retiros-pendientes`);
  }

  // PATCH /api/caja/movimientos/:id/confirmar — el cajero confirma que vio
  // el retiro; la respuesta trae lo necesario para imprimir el comprobante.
  confirmarRetiro(id: number): Observable<MovimientoCaja> {
    return this.http.patch<MovimientoCaja>(`${this.apiUrl}/caja/movimientos/${id}/confirmar`, {});
  }
}
