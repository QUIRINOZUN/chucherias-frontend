// =============================================================================
// core/promociones.ts — SERVICIO DE PROMOCIONES (2026-11-16)
// =============================================================================
// Habla con /api/promociones (administrador/encargado). Ver routes/promociones.js.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TipoPromocion = 'porcentaje' | 'monto';
export type AlcancePromocion = 'todo' | 'categoria' | 'producto' | 'variante';

export interface Promocion {
  id: number;
  nombre: string;
  tipo: TipoPromocion;
  valor: number;
  alcance: AlcancePromocion;
  alcance_id: number | null;
  // 0 = domingo ... 6 = sábado; null = todos los días.
  dias_semana: number[] | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activo: boolean;
  vigente_ahora: boolean;
}

export interface DatosPromocion {
  nombre: string;
  tipo: TipoPromocion;
  valor: number;
  alcance: AlcancePromocion;
  alcance_id: number | null;
  dias_semana: number[] | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

@Injectable({ providedIn: 'root' })
export class PromocionesService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listar(): Observable<Promocion[]> {
    return this.http.get<Promocion[]>(`${this.apiUrl}/promociones`);
  }

  crear(datos: DatosPromocion): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.apiUrl}/promociones`, datos);
  }

  editar(id: number, datos: DatosPromocion): Observable<{ id: number }> {
    return this.http.patch<{ id: number }>(`${this.apiUrl}/promociones/${id}`, datos);
  }

  cambiarActivo(id: number, activo: boolean): Observable<{ id: number; activo: boolean }> {
    return this.http.patch<{ id: number; activo: boolean }>(
      `${this.apiUrl}/promociones/${id}/activo`,
      { activo },
    );
  }

  eliminar(id: number): Observable<{ id: number; eliminado: boolean }> {
    return this.http.delete<{ id: number; eliminado: boolean }>(`${this.apiUrl}/promociones/${id}`);
  }
}
