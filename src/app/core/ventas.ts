// =============================================================================
// core/ventas.ts — SERVICIO DE VENTAS
// =============================================================================
// Habla con /api/ventas: registrar una venta (POS), listar las del día y
// cancelar una (historial de ventas). Define además los tipos de datos que
// viajan en esas llamadas.
//
// IMPORTANTE: al registrar una venta el frontend NO manda precios; solo la
// variante y la cantidad. El servidor calcula los precios por su cuenta.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MetodoPago = 'efectivo' | 'transferencia';
export type TipoEntrega = 'presencial' | 'domicilio';

// Un producto del carrito tal como se envía al servidor.
export interface ItemVenta {
  variante_id: number;
  cantidad: number;
  // Personalización ya armada como texto, ej. "Sin: tocino · sin picante".
  notas?: string;
}

// Cuerpo de POST /api/ventas.
export interface NuevaVenta {
  items: ItemVenta[];
  metodo_pago: MetodoPago;
  tipo_entrega: TipoEntrega;
  cliente_id?: number;
}

// Lo que responde el servidor tras registrar la venta (se usa para el
// número de orden del comprobante).
export interface RespuestaVenta {
  orden: { id: number; numero_orden: string };
  venta: { id: number; subtotal: string; total: string; metodo_pago: MetodoPago };
}

// Un renglón de producto dentro de una venta del historial.
export interface ItemVentaHistorial {
  producto: string;
  variante: string;
  cantidad: number;
  notas: string | null;
}

// Una venta tal como la muestra el historial (GET /api/ventas). Los montos
// llegan como texto porque PostgreSQL devuelve NUMERIC así.
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
  // Datos de auditoría de la cancelación (RF-03): motivo, quién y cuándo.
  motivo_cancelacion: string | null;
  cancelado_por_nombre: string | null;
  fecha_cancelacion: string | null;
  items: ItemVentaHistorial[];
}

@Injectable({ providedIn: 'root' })
export class VentasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // POST /api/ventas — registra orden + detalle + venta en una transacción.
  registrarVenta(venta: NuevaVenta): Observable<RespuestaVenta> {
    return this.http.post<RespuestaVenta>(`${this.apiUrl}/ventas`, venta);
  }

  // GET /api/ventas — ventas de un día (hoy si no se indica `fecha`).
  // Solo administrador y encargado.
  listar(fecha?: string): Observable<VentaHistorial[]> {
    return this.http.get<VentaHistorial[]>(`${this.apiUrl}/ventas`, {
      params: fecha ? { fecha } : {},
    });
  }

  // PATCH /api/ventas/:id/cancelar — solo administrador y encargado.
  cancelar(id: number, motivo: string): Observable<VentaHistorial> {
    return this.http.patch<VentaHistorial>(`${this.apiUrl}/ventas/${id}/cancelar`, { motivo });
  }
}
