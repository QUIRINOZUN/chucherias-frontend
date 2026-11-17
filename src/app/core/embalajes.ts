// =============================================================================
// core/embalajes.ts — EMBALAJES Y DECORACIONES (2026-11-17)
// =============================================================================
// Catálogo de lo que se usa para empacar: charolas, cajas de pizza, bolsas (ventas normales) y
// embalaje y decoración de las ventas especiales. Cada uno es un insumo más, así que su
// existencia se mueve con las entradas, ajustes y mermas de InsumosService.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type UsoEmbalaje = 'venta' | 'especial';
export type ClaseEmbalaje = 'embalaje' | 'decoracion';

export interface Embalaje {
  id: number;
  nombre: string;
  unidad_medida: string;
  uso: UsoEmbalaje;
  clase: ClaseEmbalaje | null;
  existencia: number;
  agotado: boolean;
  // Solo los ve administrador/encargado (el cajero únicamente elige en el cobro).
  cantidad_minima?: number;
  costo_unitario?: number | null;
  proveedor?: string | null;
  alerta?: boolean;
}

export interface DatosEmbalaje {
  nombre?: string;
  unidad_medida?: string;
  uso?: UsoEmbalaje;
  clase?: ClaseEmbalaje | null;
  cantidad_minima?: number | null;
  costo_unitario?: number | string | null;
}

// Lo que viaja en una venta o en una cotización: cuántos de cada embalaje se usan.
export interface EmbalajeUsado {
  insumo_id: number;
  cantidad: number;
}

@Injectable({ providedIn: 'root' })
export class EmbalajesService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listar(uso?: UsoEmbalaje): Observable<Embalaje[]> {
    let params = new HttpParams();
    if (uso) params = params.set('uso', uso);
    return this.http.get<Embalaje[]>(`${this.apiUrl}/embalajes`, { params });
  }

  crear(datos: DatosEmbalaje): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.apiUrl}/embalajes`, datos);
  }

  editar(id: number, datos: DatosEmbalaje): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.apiUrl}/embalajes/${id}`, datos);
  }

  eliminar(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/embalajes/${id}`);
  }
}
