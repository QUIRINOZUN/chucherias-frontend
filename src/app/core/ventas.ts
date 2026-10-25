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
import { EstadoOrden } from './ordenes';

export type MetodoPago = 'efectivo' | 'transferencia';
export type TipoEntrega = 'presencial' | 'domicilio';

// Un producto del carrito tal como se envía al servidor.
export interface ItemVenta {
  variante_id: number;
  cantidad: number;
  // Personalización ya armada como texto, ej. "Sin: tocino · sin picante".
  notas?: string;
  // Fase 2 del recetario: nombres EXACTOS de insumo (tabla `insumos`) que no
  // se deben descontar al preparar esta línea. Vacío/ausente = nada quitado.
  insumos_quitados?: string[];
  // Insumos elegidos (salsa/topping) que SÍ hay que descontar aunque no
  // estén en la receta fija de la variante (ver producto-elecciones.ts).
  insumos_elegidos?: { insumo: string; cantidad: number; unidad_medida: string }[];
}

// Cuerpo de POST /api/ventas. cliente_nombre/cliente_direccion/
// cliente_telefono solo son obligatorios (el servidor los valida) cuando
// tipo_entrega es 'domicilio'.
export interface NuevaVenta {
  items: ItemVenta[];
  metodo_pago: MetodoPago;
  tipo_entrega: TipoEntrega;
  cliente_nombre?: string;
  cliente_direccion?: string;
  cliente_telefono?: string;
  // Opcional, solo tiene sentido en domicilio — se puede asignar después
  // desde Comandas si todavía no se sabe quién la va a llevar.
  repartidor_id?: number;
  cliente_id?: number;
}

// Lo que responde el servidor tras registrar la venta (se usa para el
// número de orden del comprobante).
export interface RespuestaVenta {
  orden: { id: number; numero_orden: string };
  venta: {
    id: number;
    subtotal: string;
    descuento_lealtad: string;
    total: string;
    metodo_pago: MetodoPago;
  };
  // Solo si la venta llevaba cliente_id: la visita del ciclo (0-9) en la que
  // quedó DESPUÉS de esta compra — alimenta el avance "X de 10" del ticket.
  // Nunca se usa para calcular dinero, eso ya lo decidió venta.descuento_lealtad.
  visitas_lealtad: number | null;
}

// Un renglón de producto dentro de una venta del historial. Puede cancelarse
// por separado del resto (cancelación parcial — ver cancelar() más abajo).
export interface ItemVentaHistorial {
  orden_detalle_id: number;
  producto: string;
  variante: string;
  cantidad: number;
  notas: string | null;
  cancelado: boolean;
  // Motivo escrito al cancelar ESTE producto específico (vive por línea, no
  // solo a nivel venta, porque una cancelación parcial no siempre deja la
  // venta entera como 'cancelada' — ver VentaHistorial.motivo_cancelacion).
  motivo_cancelacion: string | null;
  precio_unitario: string;
}

// Una venta tal como la muestra el historial (GET /api/ventas). Los montos
// llegan como texto porque PostgreSQL devuelve NUMERIC así.
export interface VentaHistorial {
  id: number;
  orden_id: number;
  numero_orden: string;
  tipo_entrega: TipoEntrega;
  // Solo llenos cuando tipo_entrega es 'domicilio'.
  cliente_nombre: string | null;
  cliente_direccion: string | null;
  cliente_telefono: string | null;
  // Nombre del cliente de LEALTAD ligado a la orden (RF-21/RF-22) — distinto
  // de cliente_nombre, que es el del pedido a domicilio (pueden coincidir o
  // no: un cliente de lealtad puede pedir presencial, y viceversa).
  cliente_lealtad_nombre: string | null;
  // Repartidor asignado (solo domicilio) — null si todavía no se asigna.
  repartidor_nombre: string | null;
  fecha: string;
  subtotal: string;
  descuento_lealtad: string;
  total: string;
  metodo_pago: MetodoPago;
  // 'completada' incluye una venta con ALGUNOS productos cancelados pero no
  // todos (cancelación parcial) — solo pasa a 'cancelada' cuando ya no le
  // queda ningún producto activo.
  estado: 'completada' | 'cancelada';
  // Estado actual de la comanda (sin_preparar/preparando/.../cancelada) —
  // decide qué opciones de cancelación tiene sentido ofrecer (ver RF-11).
  estado_orden: EstadoOrden;
  cajero: string;
  // Datos de auditoría de la cancelación (RF-03): motivo, quién y cuándo.
  // Quedan llenos aunque la cancelación haya sido solo PARCIAL (reflejan la
  // última vez que se canceló algo de esta venta).
  motivo_cancelacion: string | null;
  cancelado_por_nombre: string | null;
  fecha_cancelacion: string | null;
  // Cuántas filas de merma generó la cancelación (0 en una venta no cancelada).
  // Al cancelar, cada producto cancelado se registra como merma sin importar
  // en qué estado estuviera la comanda: ya no se puede volver a vender.
  mermas_generadas: number;
  // Pesos perdidos en esa merma (precio de cada producto ya congelado al
  // momento de la venta). Llega como texto: es una suma de columnas NUMERIC.
  mermas_valor_total: string;
  // RF-11: insumos que se restituyeron al inventario al cancelar (0 en una
  // venta no cancelada, si se canceló antes de llegar a 'preparando', o si al
  // cancelar en 'preparando' no se marcó ningún insumo para rescatar).
  insumos_restituidos: number;
  // RF-08: segundos que la orden pasó en 'preparando' (null si nunca llegó
  // a ese estado, ej. se canceló mientras seguía 'sin_preparar').
  segundos_preparacion: number | null;
  // Dinero devuelto al cliente por los productos cancelados de esta venta
  // (0 si nunca se canceló nada) — ver movimientos_caja tipo 'reembolso'.
  monto_reembolsado: string;
  items: ItemVentaHistorial[];
}

// Filtros opcionales y combinables de GET /api/ventas (2026-10-22, módulo
// "Ventas" — antes solo existía `fecha`, un único día; ahora es la consulta
// general de tickets). Sin ninguno, el servidor devuelve TODO el histórico.
export interface FiltrosVentas {
  desde?: string;
  hasta?: string;
  estado?: 'completada' | 'cancelada';
  metodoPago?: MetodoPago;
  tipoEntrega?: TipoEntrega;
  // Folio, cajero, cliente (lealtad o domicilio, nombre o teléfono) o
  // nombre de producto/variante vendido — ver routes/ventas.js.
  buscar?: string;
}

// Respuesta de PATCH /:id/cancelar. No es el mismo shape que el historial
// (GET /api/ventas) — es la fila cruda de `ventas` más el resumen de lo que
// se acaba de cancelar.
export interface RespuestaCancelacion {
  id: number;
  estado: 'completada' | 'cancelada';
  cancelacion_total: boolean;
  productos_cancelados: number;
  mermas_generadas: number;
  mermas_valor_total: string;
  insumos_restituidos: number;
  monto_reembolso: string;
  // RF-23 (2026-10-16): true si esta venta había contado una visita de
  // lealtad (y, si aplica, un descuento) que se revirtió al cancelarla.
  lealtad_revertida: boolean;
}

@Injectable({ providedIn: 'root' })
export class VentasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // POST /api/ventas — registra orden + detalle + venta en una transacción.
  registrarVenta(venta: NuevaVenta): Observable<RespuestaVenta> {
    return this.http.post<RespuestaVenta>(`${this.apiUrl}/ventas`, venta);
  }

  // GET /api/ventas — consulta de tickets con filtros opcionales y
  // combinables (sin ninguno, todo el histórico). Solo administrador y
  // encargado.
  listar(filtros: FiltrosVentas = {}): Observable<VentaHistorial[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) params['desde'] = filtros.desde;
    if (filtros.hasta) params['hasta'] = filtros.hasta;
    if (filtros.estado) params['estado'] = filtros.estado;
    if (filtros.metodoPago) params['metodo_pago'] = filtros.metodoPago;
    if (filtros.tipoEntrega) params['tipo_entrega'] = filtros.tipoEntrega;
    if (filtros.buscar?.trim()) params['buscar'] = filtros.buscar.trim();
    return this.http.get<VentaHistorial[]>(`${this.apiUrl}/ventas`, { params });
  }

  // PATCH /api/ventas/:id/cancelar — solo administrador y encargado.
  // `ordenDetalleIds`: qué productos cancelar (vacío/ausente = todos los
  // activos, cancelación total — el comportamiento de siempre).
  // `insumosRescatados`: solo importa si la comanda está 'preparando' — ids
  // de insumo que se RESCATAN; el resto de lo descontado queda como merma.
  cancelar(
    id: number,
    motivo: string,
    ordenDetalleIds?: number[],
    insumosRescatados?: number[],
  ): Observable<RespuestaCancelacion> {
    return this.http.patch<RespuestaCancelacion>(`${this.apiUrl}/ventas/${id}/cancelar`, {
      motivo,
      orden_detalle_ids: ordenDetalleIds,
      insumos_rescatados: insumosRescatados,
    });
  }
}
