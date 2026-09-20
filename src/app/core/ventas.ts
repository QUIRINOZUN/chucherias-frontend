import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MetodoPago = 'efectivo' | 'transferencia';

export interface ItemVenta {
  variante_id: number;
  cantidad: number;
  notas?: string;
}

export interface NuevaVenta {
  items: ItemVenta[];
  metodo_pago: MetodoPago;
  cliente_id?: number;
}

export interface RespuestaVenta {
  orden: { id: number; numero_orden: string };
  venta: { id: number; subtotal: string; total: string; metodo_pago: MetodoPago };
}

@Injectable({ providedIn: 'root' })
export class VentasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  registrarVenta(venta: NuevaVenta): Observable<RespuestaVenta> {
    return this.http.post<RespuestaVenta>(`${this.apiUrl}/ventas`, venta);
  }
}
