// =============================================================================
// core/lealtad.ts — CONFIGURACIÓN DEL PROGRAMA DE LEALTAD (2026-10-31)
// =============================================================================
// Habla con /api/lealtad. El cómputo real del descuento sigue viviendo en el
// servidor (routes/ventas.js, al registrar una venta) — aquí solo se
// consulta/edita la configuración: el largo del ciclo, el monto mínimo de
// compra, y los escalones (en qué visita, qué % de descuento).
//
// Leer la configuración (obtenerConfig/listarEscalones) es para CUALQUIER
// rol con sesión — el POS la necesita para la vista previa del descuento
// antes de cobrar y para dibujar el avance del ciclo en el ticket. Editarla
// (actualizarConfig/crear·editar·eliminar escalón) la protege el servidor a
// administrador/encargado.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ConfigLealtad {
  ciclo_visitas: number;
  monto_minimo_compra: number;
  editado_por: number | null;
  editado_por_nombre: string | null;
  fecha_edicion: string | null;
}

export interface EscalonLealtad {
  id: number;
  visita_numero: number;
  porcentaje_descuento: number;
  descripcion: string | null;
  editado_por: number | null;
  editado_por_nombre: string | null;
  fecha_edicion: string | null;
}

export interface DatosEscalon {
  visita_numero: number;
  porcentaje_descuento: number;
  descripcion?: string | null;
}

@Injectable({ providedIn: 'root' })
export class LealtadService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/lealtad/config
  obtenerConfig(): Observable<ConfigLealtad> {
    return this.http.get<ConfigLealtad>(`${this.apiUrl}/lealtad/config`);
  }

  // PATCH /api/lealtad/config
  actualizarConfig(datos: {
    ciclo_visitas?: number;
    monto_minimo_compra?: number;
  }): Observable<ConfigLealtad> {
    return this.http.patch<ConfigLealtad>(`${this.apiUrl}/lealtad/config`, datos);
  }

  // GET /api/lealtad/escalones
  listarEscalones(): Observable<EscalonLealtad[]> {
    return this.http.get<EscalonLealtad[]>(`${this.apiUrl}/lealtad/escalones`);
  }

  // POST /api/lealtad/escalones
  crearEscalon(datos: DatosEscalon): Observable<EscalonLealtad> {
    return this.http.post<EscalonLealtad>(`${this.apiUrl}/lealtad/escalones`, datos);
  }

  // PATCH /api/lealtad/escalones/:id
  editarEscalon(id: number, datos: Partial<DatosEscalon>): Observable<EscalonLealtad> {
    return this.http.patch<EscalonLealtad>(`${this.apiUrl}/lealtad/escalones/${id}`, datos);
  }

  // DELETE /api/lealtad/escalones/:id
  eliminarEscalon(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/lealtad/escalones/${id}`);
  }
}
