// =============================================================================
// core/empleados.ts — SERVICIO DE PERSONAL (Sprint 3, control de asistencias)
// =============================================================================
// Habla con /api/empleados. Permisos (los aplica el servidor): todo
// administrador y encargado.
//
// 2026-10-11 ("los usuarios son empleados"): el alta ya no se hace desde
// aquí — todo empleado nace junto con su cuenta en routes/usuarios.js (el
// backend conserva POST /api/empleados por si hace falta un alta directa
// por API, pero el frontend ya no lo expone). Este servicio solo lista,
// edita y activa/desactiva.
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

// Datos para editar un empleado. usuario_id es opcional: omitirlo conserva
// el vínculo actual; mandar null lo quita.
export interface DatosEmpleado {
  nombre: string;
  puesto: string;
  fecha_ingreso: string;
  usuario_id?: number | null;
}

// Repartidor activo, lista ligera para el selector del cobro a domicilio
// (POS) y de Comandas — ver GET /api/empleados/repartidores.
export interface Repartidor {
  id: number;
  nombre: string;
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

  // PATCH /api/empleados/:id
  editar(id: number, datos: Partial<DatosEmpleado>): Observable<Empleado> {
    return this.http.patch<Empleado>(`${this.apiUrl}/empleados/${id}`, datos);
  }

  // PATCH /api/empleados/:id/activo — nunca se borra un empleado (su
  // historial de asistencias quedaría huérfano).
  cambiarActivo(id: number, activo: boolean): Observable<Empleado> {
    return this.http.patch<Empleado>(`${this.apiUrl}/empleados/${id}/activo`, { activo });
  }

  // GET /api/empleados/repartidores — también la puede llamar el cajero
  // (a diferencia del resto de este servicio), para el selector del cobro
  // a domicilio.
  listarRepartidores(): Observable<Repartidor[]> {
    return this.http.get<Repartidor[]>(`${this.apiUrl}/empleados/repartidores`);
  }
}
