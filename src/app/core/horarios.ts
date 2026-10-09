// =============================================================================
// core/horarios.ts — SERVICIO DE HORARIO SEMANAL (Sprint 3)
// =============================================================================
// Habla con /api/horarios. Permisos (los aplica el servidor): administrador
// y encargado. El horario es RECURRENTE (por día de la semana, sin fecha
// propia) — se repite cada semana hasta que alguien lo vuelva a guardar.
//
// `horario_excepciones` (2026-10-08) es el complemento: un día SUELTO
// distinto al patrón normal de un empleado (feriado, vacaciones, etc.), sin
// afectar las demás semanas. El servidor no combina nada — el estado
// EFECTIVO de un día (¿trabaja, descansa, o está cerrado?) se calcula en el
// frontend: si hay excepción para esa fecha, gana; si no, se usa el
// horario recurrente según el día de la semana; si tampoco hay fila ahí,
// es "descanso" (ver estadoDelDia() en asistencias/asistencias.ts).
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type DiaSemana =
  'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';

export interface Horario {
  id: number;
  empleado_id: number;
  empleado_nombre: string;
  dia_semana: DiaSemana;
  hora_entrada: string; // HH:MM:SS
  hora_salida: string;
}

// Un día del horario a guardar (PUT /empleado/:id) — solo los días que
// trabaja; los que no vengan en la lista quedan libres.
export interface DiaHorario {
  dia_semana: DiaSemana;
  hora_entrada: string; // HH:MM
  hora_salida: string;
}

export type TipoExcepcion = 'trabaja' | 'descanso' | 'cerrado';

export interface ExcepcionHorario {
  id: number;
  empleado_id: number;
  fecha: string; // AAAA-MM-DD
  tipo: TipoExcepcion;
  hora_entrada: string | null; // HH:MM:SS — solo si tipo = 'trabaja'
  hora_salida: string | null;
}

// Datos para crear/reemplazar la excepción de un día (PUT
// /excepciones/:empleadoId/:fecha). Las horas solo se mandan si
// tipo = 'trabaja'.
export interface DatosExcepcion {
  tipo: TipoExcepcion;
  hora_entrada?: string;
  hora_salida?: string;
}

@Injectable({ providedIn: 'root' })
export class HorariosService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/horarios?empleado_id=
  listar(empleadoId?: number): Observable<Horario[]> {
    const params: Record<string, string> = empleadoId ? { empleado_id: String(empleadoId) } : {};
    return this.http.get<Horario[]>(`${this.apiUrl}/horarios`, { params });
  }

  // PUT /api/horarios/empleado/:id — reemplaza TODO el horario semanal.
  guardarSemana(empleadoId: number, dias: DiaHorario[]): Observable<Horario[]> {
    return this.http.put<Horario[]>(`${this.apiUrl}/horarios/empleado/${empleadoId}`, { dias });
  }

  // GET /api/horarios/excepciones?empleado_id=&desde=&hasta=
  listarExcepciones(
    empleadoId: number,
    desde: string,
    hasta: string,
  ): Observable<ExcepcionHorario[]> {
    const params: Record<string, string> = { empleado_id: String(empleadoId), desde, hasta };
    return this.http.get<ExcepcionHorario[]>(`${this.apiUrl}/horarios/excepciones`, { params });
  }

  // PUT /api/horarios/excepciones/:empleadoId/:fecha — crea o reemplaza.
  guardarExcepcion(
    empleadoId: number,
    fecha: string,
    datos: DatosExcepcion,
  ): Observable<ExcepcionHorario> {
    return this.http.put<ExcepcionHorario>(
      `${this.apiUrl}/horarios/excepciones/${empleadoId}/${fecha}`,
      datos,
    );
  }

  // DELETE /api/horarios/excepciones/:empleadoId/:fecha — ese día vuelve a
  // usar el horario normal.
  quitarExcepcion(empleadoId: number, fecha: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(
      `${this.apiUrl}/horarios/excepciones/${empleadoId}/${fecha}`,
    );
  }
}
