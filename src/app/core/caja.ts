// =============================================================================
// core/caja.ts — SERVICIO DE CAJA Y CORTES (RF-04)
// =============================================================================
// Habla con /api/caja. Lo usa la pantalla de Corte de caja para:
//   - obtenerResumen  → lo que el SISTEMA calcula que debería haber hoy.
//   - registrarCorte  → guardar el corte (contado físicamente vs. sistema).
//   - obtenerHistorial → consultar cortes anteriores con filtros.
//
// Permisos (los aplica el servidor): resumen y corte → administrador,
// encargado y cajero; historial → solo administrador y encargado.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Lo que el sistema calculó para un día (suma de ventas completadas).
export interface ResumenCaja {
  fecha: string;
  total_efectivo: number;
  total_transferencia: number;
  total_sistema: number;
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
}
