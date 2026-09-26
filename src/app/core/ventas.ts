import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MetodoPago = 'efectivo' | 'transferencia';
export type TipoEntrega = 'presencial' | 'domicilio';

export interface ItemVenta {
  variante_id: number;
  cantidad: number;
  notas?: string;
}

export interface NuevaVenta {
  items: ItemVenta[];
  metodo_pago: MetodoPago;
  tipo_entrega: TipoEntrega;
  cliente_id?: number;
}

export interface RespuestaVenta {
  orden: { id: number; numero_orden: string };
  venta: { id: number; subtotal: string; total: string; metodo_pago: MetodoPago };
}

export interface ItemVentaHistorial {
  producto: string;
  variante: string;
  cantidad: number;
  notas: string | null;
}

export interface VentaHistorial {
  id: number;
  orden_id: number;
  numero_orden: string;
  tipo_entrega: TipoEntrega;
  fecha: string;
  subtotal: string;
  descuento_lealtad: string;
  total: string;
  metodo_pago: MetodoPago;
  estado: 'completada' | 'cancelada';
  cajero: string;
  motivo_cancelacion: string | null;
  cancelado_por_nombre: string | null;
  fecha_cancelacion: string | null;
  items: ItemVentaHistorial[];
}

@Injectable({ providedIn: 'root' })
export class VentasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  registrarVenta(venta: NuevaVenta): Observable<RespuestaVenta> {
    return this.http.post<RespuestaVenta>(`${this.apiUrl}/ventas`, venta);
  }

  listar(fecha?: string): Observable<VentaHistorial[]> {
    return this.http.get<VentaHistorial[]>(`${this.apiUrl}/ventas`, {
      params: fecha ? { fecha } : {},
    });
  }

  cancelar(id: number, motivo: string): Observable<VentaHistorial> {
    return this.http.patch<VentaHistorial>(`${this.apiUrl}/ventas/${id}/cancelar`, { motivo });
  }
}
