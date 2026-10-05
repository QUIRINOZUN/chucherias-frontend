// =============================================================================
// core/empleados.ts — SERVICIO DE PERSONAL (Sprint 3, control de asistencias)
// =============================================================================
// Habla con /api/empleados. `empleados` es un dominio DISTINTO de `usuarios`:
// un empleado no necesariamente tiene una cuenta para entrar al sistema
// (ej. un repartidor). `usuario_id` solo liga al empleado con su cuenta
// cuando la tiene. Permisos (los aplica el servidor): todo administrador y
// encargado.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Empleado {
  id: number;
  nombre: string;
  puesto: string;
  fecha_ingreso: string; // AAAA-MM-DD
  activo: boolean;
  usuario_id: number | null;
  // Nombre de la cuenta ligada, si tiene una (viene del LEFT JOIN del servidor).
  usuario_login: string | null;
}

// Datos para crear o editar un empleado. usuario_id es opcional: en la
// edición, omitirlo conserva el vínculo actual; mandar null lo quita.
export interface DatosEmpleado {
  nombre: string;
  puesto: string;
  fecha_ingreso: string;
  usuario_id?: number | null;
}

@Injectable({ providedIn: 'root' })
export class EmpleadosService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/empleados — por default solo activos; incluirInactivos trae
  // también a los desactivados (para la pantalla de gestión).
  listar(incluirInactivos = false): Observable<Empleado[]> {
    const params: Record<string, string> = incluirInactivos ? { todos: '1' } : {};
    return this.http.get<Empleado[]>(`${this.apiUrl}/empleados`, { params });
  }

  // POST /api/empleados
  crear(datos: DatosEmpleado): Observable<Empleado> {
    return this.http.post<Empleado>(`${this.apiUrl}/empleados`, datos);
  }

  // PATCH /api/empleados/:id
  editar(id: number, datos: Partial<DatosEmpleado>): Observable<Empleado> {
    return this.http.patch<Empleado>(`${this.apiUrl}/empleados/${id}`, datos);
  }

  // PATCH /api/empleados/:id/activo — nunca se borra un empleado (su
  // historial de asistencias quedaría huérfano).
  cambiarActivo(id: number, activo: boolean): Observable<Empleado> {
    return this.http.patch<Empleado>(`${this.apiUrl}/empleados/${id}/activo`, { activo });
  }
}
