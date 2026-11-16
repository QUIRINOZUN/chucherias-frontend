// =============================================================================
// core/compras.ts — SERVICIO DE COMPRAS A PROVEEDORES (2026-11-16)
// =============================================================================
// Habla con /api/compras: qué hay que surtir (insumos bajo su mínimo), las
// órdenes de compra y el registro de la llegada de la mercancía. Solo
// administrador/encargado. Ver routes/compras.js.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SugerenciaCompra {
  insumo_id: number;
  nombre: string;
  unidad_medida: string;
  existencia: number;
  cantidad_minima: number;
  en_pedido: number;
  cantidad_sugerida: number;
  costo_unitario: number | null;
  proveedor_id: number | null;
  proveedor: string | null;
}

export type EstadoCompra = 'pendiente' | 'recibida' | 'cancelada';

export interface OrdenCompraResumen {
  id: number;
  estado: EstadoCompra;
  nota: string | null;
  fecha_creacion: string;
  fecha_recepcion: string | null;
  proveedor_id: number | null;
  proveedor: string | null;
  creado_por_nombre: string;
  renglones: number;
  total_recibido: number;
}

export interface RenglonCompra {
  id: number;
  insumo_id: number;
  nombre: string;
  unidad_medida: string;
  costo_unitario: number | null;
  cantidad_pedida: number;
  cantidad_recibida: number | null;
  costo_total_recibido: number | null;
}

export interface OrdenCompraDetalle {
  id: number;
  estado: EstadoCompra;
  nota: string | null;
  fecha_creacion: string;
  fecha_recepcion: string | null;
  proveedor_id: number | null;
  proveedor: string | null;
  items: RenglonCompra[];
}

export interface PrecioProveedor {
  proveedor_id: number | null;
  proveedor: string;
  compras: number;
  costo_minimo: number;
  ultimo_costo: number;
  ultima_fecha: string;
}

@Injectable({ providedIn: 'root' })
export class ComprasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  sugerencias(): Observable<SugerenciaCompra[]> {
    return this.http.get<SugerenciaCompra[]>(`${this.apiUrl}/compras/sugerencias`);
  }

  precios(insumoId: number): Observable<PrecioProveedor[]> {
    return this.http.get<PrecioProveedor[]>(`${this.apiUrl}/compras/precios/${insumoId}`);
  }

  listar(estado?: EstadoCompra): Observable<OrdenCompraResumen[]> {
    const params: Record<string, string> = {};
    if (estado) params['estado'] = estado;
    return this.http.get<OrdenCompraResumen[]>(`${this.apiUrl}/compras`, { params });
  }

  obtener(id: number): Observable<OrdenCompraDetalle> {
    return this.http.get<OrdenCompraDetalle>(`${this.apiUrl}/compras/${id}`);
  }

  crear(datos: {
    proveedor_id: number | null;
    nota?: string;
    items: { insumo_id: number; cantidad_pedida: number }[];
  }): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.apiUrl}/compras`, datos);
  }

  cancelar(id: number): Observable<{ id: number; estado: EstadoCompra }> {
    return this.http.patch<{ id: number; estado: EstadoCompra }>(
      `${this.apiUrl}/compras/${id}/cancelar`,
      {},
    );
  }

  recibir(
    id: number,
    items: { detalle_id: number; cantidad_recibida: number; costo_total?: number | null }[],
  ): Observable<{ ok: boolean; entradas: number }> {
    return this.http.post<{ ok: boolean; entradas: number }>(
      `${this.apiUrl}/compras/${id}/recibir`,
      { items },
    );
  }
}
