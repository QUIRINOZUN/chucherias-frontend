// =============================================================================
// core/asistencias.ts — SERVICIO DE CONTROL DE ASISTENCIAS (Sprint 3)
// =============================================================================
// Habla con /api/asistencias: listar, listarHoy, marcarEntrada/Salida de un
// empleado, capturarManual, corregir — todo exclusivo de administrador/
// encargado, nunca el propio empleado (2026-10-11: se retiró el
// autoservicio — miHoy/marcarMiEntrada/marcarMiSalida — a petición del
// usuario; ver routes/asistencias.js y routes/auth.js).
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Asistencia {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  puesto: string;
  fecha: string; // AAAA-MM-DD
  hora_entrada: string | null; // HH:MM:SS
  hora_salida: string | null;
  observaciones: string | null;
  registrado_por_nombre: string | null;
  // RF-19 (2026-10-13): resumen de la última corrección, si tuvo alguna —
  // el historial completo se pide aparte, ver obtenerCorrecciones().
  fecha_ultima_correccion: string | null;
  ultima_correccion_por_nombre: string | null;
}

// Una corrección del historial de UN registro (GET /:id/correcciones).
export interface CorreccionHistorial {
  id: number;
  fecha_correccion: string;
  corregido_por_nombre: string;
  fecha_anterior: string;
  hora_entrada_anterior: string | null;
  hora_salida_anterior: string | null;
  observaciones_anteriores: string | null;
}

// RF-20 (2026-10-13): una entrada real más tarde que la hora esperada.
export interface Retardo {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  fecha: string;
  hora_entrada: string;
  hora_esperada: string;
  minutos_retardo: number;
}

export interface FiltrosAsistencias {
  desde?: string;
  hasta?: string;
  empleado_id?: number | null;
}

// Para la captura manual de un día que no se marcó en vivo (POST /).
export interface CapturaManualAsistencia {
  empleado_id: number;
  fecha: string;
  hora_entrada?: string;
  hora_salida?: string;
  observaciones?: string;
}

// Para corregir un registro ya existente (PATCH /:id) — todo opcional.
export interface CorreccionAsistencia {
  fecha?: string;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  observaciones?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AsistenciasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/asistencias?desde=&hasta=&empleado_id= — historial con filtros
  // opcionales; sin filtros se ve todo.
  listar(filtros: FiltrosAsistencias = {}): Observable<Asistencia[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) {
      params['desde'] = filtros.desde;
    }
    if (filtros.hasta) {
      params['hasta'] = filtros.hasta;
    }
    if (filtros.empleado_id) {
      params['empleado_id'] = String(filtros.empleado_id);
    }
    return this.http.get<Asistencia[]>(`${this.apiUrl}/asistencias`, { params });
  }

  // GET /api/asistencias/hoy — alimenta el panel de "marcar entrada/salida".
  listarHoy(): Observable<Asistencia[]> {
    return this.http.get<Asistencia[]>(`${this.apiUrl}/asistencias/hoy`);
  }

  // POST /api/asistencias/entrada — marca la entrada AHORA.
  marcarEntrada(empleadoId: number, observaciones?: string): Observable<Asistencia> {
    return this.http.post<Asistencia>(`${this.apiUrl}/asistencias/entrada`, {
      empleado_id: empleadoId,
      observaciones,
    });
  }

  // PATCH /api/asistencias/:id/salida — marca la salida AHORA.
  marcarSalida(id: number): Observable<Asistencia> {
    return this.http.patch<Asistencia>(`${this.apiUrl}/asistencias/${id}/salida`, {});
  }

  // POST /api/asistencias — captura manual completa (día que no se marcó en vivo).
  capturarManual(datos: CapturaManualAsistencia): Observable<Asistencia> {
    return this.http.post<Asistencia>(`${this.apiUrl}/asistencias`, datos);
  }

  // PATCH /api/asistencias/:id — corrige un registro existente.
  corregir(id: number, datos: CorreccionAsistencia): Observable<Asistencia> {
    return this.http.patch<Asistencia>(`${this.apiUrl}/asistencias/${id}`, datos);
  }

  // GET /api/asistencias/:id/correcciones — RF-19, historial completo de
  // correcciones de un registro (quién, cuándo, valor anterior).
  obtenerCorrecciones(id: number): Observable<CorreccionHistorial[]> {
    return this.http.get<CorreccionHistorial[]>(`${this.apiUrl}/asistencias/${id}/correcciones`);
  }

  // GET /api/asistencias/retardos?desde=&hasta=&empleado_id= — RF-20.
  obtenerRetardos(filtros: FiltrosAsistencias = {}): Observable<Retardo[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) {
      params['desde'] = filtros.desde;
    }
    if (filtros.hasta) {
      params['hasta'] = filtros.hasta;
    }
    if (filtros.empleado_id) {
      params['empleado_id'] = String(filtros.empleado_id);
    }
    return this.http.get<Retardo[]>(`${this.apiUrl}/asistencias/retardos`, { params });
  }

  // DELETE /api/asistencias/historial?desde=&hasta= — elimina registros de
  // asistencia del rango, irreversible. Solo administrador.
  eliminarHistorial(desde: string, hasta: string): Observable<{ eliminados: number }> {
    return this.http.delete<{ eliminados: number }>(`${this.apiUrl}/asistencias/historial`, {
      params: { desde, hasta },
    });
  }
}
