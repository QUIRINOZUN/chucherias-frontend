// =============================================================================
// core/ventas-especiales.ts — SERVICIO DE VENTAS ESPECIALES (agendar/cotizar)
// =============================================================================
// Habla con /api/ventas-especiales. Esto NO es una venta real — es una
// cotización con fecha agendada (desayuno, comida, sorpresa especial), para
// planear un pedido grande con el menú completo por adelantado. El precio de
// cada producto SIEMPRE lo resuelve el servidor (nunca se manda un precio
// desde aquí) — ver routes/ventasEspeciales.js. Permisos (los aplica el
// servidor): administrador, encargado y cajero.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TipoVentaEspecial = 'desayuno' | 'comida' | 'sorpresa' | 'otro';
export type EstadoVentaEspecial = 'cotizada' | 'confirmada' | 'entregada' | 'cancelada';

// Un producto ya cotizado, tal como lo devuelve el servidor (con nombre de
// producto/variante resueltos, para no tener que cruzarlo contra el catálogo).
export interface ItemVentaEspecial {
  id: number;
  variante_id: number;
  variante_nombre: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  notas: string | null;
}

// Fila de la agenda (lista) — sin los detalles pesados (dirección, notas,
// items completos), igual criterio que cualquier otra lista de este proyecto.
export interface VentaEspecialResumen {
  id: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: TipoVentaEspecial;
  fecha_evento: string; // AAAA-MM-DD
  hora_evento: string | null;
  estado: EstadoVentaEspecial;
  subtotal: number;
  total_items: number;
}

export interface VentaEspecialDetalle extends VentaEspecialResumen {
  cliente_direccion: string | null;
  notas: string | null;
  creado_por: number;
  creado_por_nombre: string;
  fecha_creacion: string;
  fecha_actualizacion: string | null;
  items: ItemVentaEspecial[];
}

export interface FiltrosVentasEspeciales {
  desde?: string;
  hasta?: string;
  estado?: EstadoVentaEspecial;
  buscar?: string;
}

// Un producto que se manda al crear/editar — el servidor ignora cualquier
// precio que llegara aquí (no existe el campo); siempre lo resuelve él.
export interface ItemParaGuardar {
  variante_id: number;
  cantidad: number;
  notas?: string | null;
}

export interface DatosNuevaVentaEspecial {
  cliente_nombre: string;
  cliente_telefono?: string | null;
  cliente_direccion?: string | null;
  tipo?: TipoVentaEspecial;
  fecha_evento: string;
  hora_evento?: string | null;
  notas?: string | null;
  items: ItemParaGuardar[];
}

// Edición parcial: todo opcional, lo que no llega conserva su valor actual
// (igual criterio que PATCH /api/empleados/:id). `items`, si llega,
// reemplaza TODOS los productos cotizados de una sola vez.
export interface DatosEdicionVentaEspecial {
  cliente_nombre?: string;
  cliente_telefono?: string | null;
  cliente_direccion?: string | null;
  tipo?: TipoVentaEspecial;
  fecha_evento?: string;
  hora_evento?: string | null;
  notas?: string | null;
  estado?: EstadoVentaEspecial;
  items?: ItemParaGuardar[];
}

@Injectable({ providedIn: 'root' })
export class VentasEspecialesService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/ventas-especiales?desde=&hasta=&estado=&buscar=
  listar(filtros: FiltrosVentasEspeciales = {}): Observable<VentaEspecialResumen[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) params['desde'] = filtros.desde;
    if (filtros.hasta) params['hasta'] = filtros.hasta;
    if (filtros.estado) params['estado'] = filtros.estado;
    if (filtros.buscar) params['buscar'] = filtros.buscar;
    return this.http.get<VentaEspecialResumen[]>(`${this.apiUrl}/ventas-especiales`, { params });
  }

  // GET /api/ventas-especiales/:id
  obtener(id: number): Observable<VentaEspecialDetalle> {
    return this.http.get<VentaEspecialDetalle>(`${this.apiUrl}/ventas-especiales/${id}`);
  }

  // POST /api/ventas-especiales
  crear(datos: DatosNuevaVentaEspecial): Observable<VentaEspecialDetalle> {
    return this.http.post<VentaEspecialDetalle>(`${this.apiUrl}/ventas-especiales`, datos);
  }

  // PATCH /api/ventas-especiales/:id
  editar(id: number, datos: DatosEdicionVentaEspecial): Observable<VentaEspecialDetalle> {
    return this.http.patch<VentaEspecialDetalle>(`${this.apiUrl}/ventas-especiales/${id}`, datos);
  }

  // DELETE /api/ventas-especiales/:id — sin importar el estado de la cotización.
  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/ventas-especiales/${id}`);
  }
}
