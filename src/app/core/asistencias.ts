// =============================================================================
// core/asistencias.ts — SERVICIO DE CONTROL DE ASISTENCIAS (Sprint 3)
// =============================================================================
// Habla con /api/asistencias. Dos grupos de métodos:
//   - Gestión (listar, listarHoy, marcarEntrada/Salida de OTRO empleado,
//     capturarManual, corregir): solo administrador/encargado.
//   - Autoservicio (miHoy, marcarMiEntrada, marcarMiSalida): cualquier rol
//     salvo administrador — para cuando el personal no inicia/cierra sesión
//     por turno y necesita marcar su propia asistencia desde el dashboard.
//     Respeta la ventana horaria del negocio (ver routes/asistencias.js).
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

// Respuesta de GET /api/asistencias/mi-hoy — lo que necesita el widget de
// autoservicio del dashboard para decidir qué botón mostrar.
export interface MiEstadoHoy {
  // false para administrador o para una cuenta que todavía no se ligó a
  // ningún empleado (ver Asistencias → Empleados).
  ligado: boolean;
  abierta: { id: number; hora_entrada: string; hora_salida: null } | null;
  completados: number;
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

  // ---- Autoservicio (cualquier rol salvo administrador) ----

  // GET /api/asistencias/mi-hoy
  miHoy(): Observable<MiEstadoHoy> {
    return this.http.get<MiEstadoHoy>(`${this.apiUrl}/asistencias/mi-hoy`);
  }

  // POST /api/asistencias/mi-entrada — respeta la ventana horaria del negocio.
  marcarMiEntrada(): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.apiUrl}/asistencias/mi-entrada`, {});
  }

  // PATCH /api/asistencias/mi-salida
  marcarMiSalida(): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`${this.apiUrl}/asistencias/mi-salida`, {});
  }
}
