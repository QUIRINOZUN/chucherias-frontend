// =============================================================================
// core/horarios.ts — SERVICIO DE HORARIO SEMANAL (Sprint 3)
// =============================================================================
// Habla con /api/horarios. Permisos (los aplica el servidor): administrador
// y encargado. El horario es RECURRENTE (por día de la semana, sin fecha
// propia) — se repite cada semana hasta que alguien lo vuelva a guardar.
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
}
