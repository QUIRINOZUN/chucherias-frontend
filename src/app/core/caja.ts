import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ResumenCaja {
  fecha: string;
  total_efectivo: number;
  total_transferencia: number;
  total_sistema: number;
}

export interface NuevoCorte {
  fecha?: string;
  turno?: string;
  total_efectivo_contado: number;
  total_transferencia_contado: number;
}

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

export interface FiltrosHistorial {
  desde?: string;
  hasta?: string;
  responsableId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  obtenerResumen(fecha?: string): Observable<ResumenCaja> {
    return this.http.get<ResumenCaja>(`${this.apiUrl}/caja/resumen`, {
      params: fecha ? { fecha } : {},
    });
  }

  registrarCorte(datos: NuevoCorte): Observable<CorteCaja> {
    return this.http.post<CorteCaja>(`${this.apiUrl}/caja/corte`, datos);
  }

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
