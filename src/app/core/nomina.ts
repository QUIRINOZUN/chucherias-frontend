// =============================================================================
// core/nomina.ts — SERVICIO DE NÓMINA POR HORAS TRABAJADAS
// =============================================================================
// Habla con /api/nomina. El titular paga a su personal por HORA TRABAJADA,
// no un sueldo fijo — este servicio no calcula nada por su cuenta, solo
// pinta lo que ya le llega calculado del servidor (mismo criterio que
// core/reportes.ts: el cálculo de dinero vive siempre en el backend, nunca
// en el cliente). Permisos (los aplica el servidor): administrador y
// encargado.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Una fila por empleado: sus horas reales trabajadas en el periodo
// consultado, su tarifa (si ya la capturaron) y el pago resultante.
export interface EmpleadoNomina {
  empleado_id: number;
  nombre: string;
  puesto: string;
  // null = todavía no se capturó ninguna tarifa para este empleado.
  pago_por_hora: number | null;
  activo: boolean;
  horas_trabajadas: number;
  // Turnos con entrada pero sin salida en el periodo: NO se suman a
  // horas_trabajadas (nunca se adivina un turno sin cerrar) — se reportan
  // aparte para corregirlos desde Asistencias antes de pagar.
  turnos_sin_cerrar: number;
  // null si pago_por_hora todavía no está capturado.
  total_a_pagar: number | null;
}

export interface ResumenNomina {
  periodo: { desde: string | null; hasta: string | null };
  empleados: EmpleadoNomina[];
}

export interface FiltrosNomina {
  desde?: string;
  hasta?: string;
  empleado_id?: number;
  // Por default el servidor solo trae empleados activos; true también
  // incluye desactivados (para pagar un periodo en el que alguien todavía
  // trabajaba).
  todos?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NominaService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/nomina?desde=&hasta=&empleado_id=&todos=1
  calcular(filtros: FiltrosNomina = {}): Observable<ResumenNomina> {
    const params: Record<string, string> = {};
    if (filtros.desde) params['desde'] = filtros.desde;
    if (filtros.hasta) params['hasta'] = filtros.hasta;
    if (filtros.empleado_id) params['empleado_id'] = String(filtros.empleado_id);
    if (filtros.todos) params['todos'] = '1';
    return this.http.get<ResumenNomina>(`${this.apiUrl}/nomina`, { params });
  }

  // PATCH /api/nomina/:empleadoId/tarifa — pagoPorHora en null quita la
  // tarifa capturada (vuelve a "sin capturar").
  actualizarTarifa(empleadoId: number, pagoPorHora: number | null): Observable<EmpleadoNomina> {
    return this.http.patch<EmpleadoNomina>(`${this.apiUrl}/nomina/${empleadoId}/tarifa`, {
      pago_por_hora: pagoPorHora,
    });
  }
}
