// =============================================================================
// core/ordenes.ts — SERVICIO DE COMANDAS (Sprint 2)
// =============================================================================
// Habla con /api/ordenes. Lo usa el tablero de comandas (comandas.ts):
//   - obtenerOrdenesActivas → las órdenes que siguen en proceso.
//   - avanzarEstado         → mueve una orden un paso adelante.
//
// Los permisos los aplica el servidor: ver → todos los roles operativos;
// avanzar → administrador, encargado y auxiliar (el cajero solo consulta).
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Ciclo de vida de una orden: sin_preparar → preparando → por_entregar →
// entregado. 'cancelada' se asigna al cancelar la venta y ya no avanza.
export type EstadoOrden = 'sin_preparar' | 'preparando' | 'por_entregar' | 'entregado' | 'cancelada';

// Un producto dentro de la orden, con sus notas de personalización.
export interface ItemOrden {
  producto: string;
  variante: string;
  cantidad: number;
  notas: string | null;
}

// Una comanda tal como la muestra el tablero.
export interface Orden {
  id: number;
  numero_orden: string;
  estado: EstadoOrden;
  // 'presencial' o 'domicilio'.
  tipo_entrega: string;
  // Momento de la venta; sirve para calcular "hace X min" y resaltar demoras.
  fecha_creacion: string;
  items: ItemOrden[];
}

@Injectable({ providedIn: 'root' })
export class OrdenesService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/ordenes — solo las que siguen activas (no entregadas ni
  // canceladas), de la más antigua a la más reciente.
  obtenerOrdenesActivas(): Observable<Orden[]> {
    return this.http.get<Orden[]>(`${this.apiUrl}/ordenes`, {
      params: { estado: 'sin_preparar,preparando,por_entregar' },
    });
  }

  // PATCH /api/ordenes/:id/estado — `estado` debe ser exactamente el
  // siguiente de la secuencia; el servidor rechaza saltos y retrocesos.
  avanzarEstado(ordenId: number, estado: EstadoOrden): Observable<Orden> {
    return this.http.patch<Orden>(`${this.apiUrl}/ordenes/${ordenId}/estado`, { estado });
  }
}
