// =============================================================================
// core/bitacora.ts — SERVICIO DE LA BITÁCORA DE AUDITORÍA (2026-10-30)
// =============================================================================
// Habla con /api/bitacora — SOLO administrador, SOLO lectura. Registra quién
// hizo qué y cuándo para las acciones de alto riesgo del sistema (nunca
// "cada clic"): inicios de sesión, los 9 "Eliminar historial", eliminar un
// usuario, cancelar una venta, un retiro de caja y eliminar una venta
// especial — ver utils/bitacora.js del backend para quién escribe cada fila.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AccionBitacora =
  | 'inicio_sesion'
  | 'eliminar_historial'
  | 'eliminar_usuario'
  | 'cancelar_venta'
  | 'retiro_caja'
  | 'eliminar_venta_especial';

export interface EntradaBitacora {
  id: number;
  usuario_id: number | null;
  usuario_nombre: string;
  accion: AccionBitacora;
  detalle: string | null;
  fecha: string;
}

export interface FiltrosBitacora {
  desde?: string;
  hasta?: string;
  usuarioId?: number | null;
  accion?: AccionBitacora | null;
}

@Injectable({ providedIn: 'root' })
export class BitacoraService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/bitacora?desde=&hasta=&usuario_id=&accion= — últimas 200, más
  // recientes primero. Filtros opcionales y combinables.
  listar(filtros: FiltrosBitacora = {}): Observable<EntradaBitacora[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) params['desde'] = filtros.desde;
    if (filtros.hasta) params['hasta'] = filtros.hasta;
    if (filtros.usuarioId != null) params['usuario_id'] = String(filtros.usuarioId);
    if (filtros.accion) params['accion'] = filtros.accion;
    return this.http.get<EntradaBitacora[]>(`${this.apiUrl}/bitacora`, { params });
  }
}
