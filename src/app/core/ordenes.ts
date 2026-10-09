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
export type EstadoOrden =
  'sin_preparar' | 'preparando' | 'por_entregar' | 'entregado' | 'cancelada';

// Un producto dentro de la orden, con sus notas de personalización.
export interface ItemOrden {
  producto: string;
  variante: string;
  // Id de la variante (no de la línea): permite pedir su tutorial de
  // elaboración (RecetasService.obtenerTutorial) desde el tablero de Comandas.
  variante_id: number;
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

// Un renglón del historial de tiempos de una orden (RF-08): cuánto duró en
// ese estado. `fecha_fin` es null mientras la orden sigue ahí (el servidor ya
// calculó `duracion_segundos` contra el momento actual en ese caso).
export interface TiempoEstadoOrden {
  estado: EstadoOrden;
  fecha_inicio: string;
  fecha_fin: string | null;
  duracion_segundos: number;
}

// Un insumo que se descontó (o se descontaría) por ciertas líneas de una
// orden — lo usa el checklist de "qué rescatar" al cancelar una comanda que
// ya está en 'preparando' (ver historial-ventas).
export interface InsumoDescontado {
  insumo_id: number;
  nombre: string;
  unidad_medida: string;
  cantidad: number;
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

  // GET /api/ordenes/:id/tiempos — cuánto duró la orden en cada estado
  // (RF-08). Solo administrador y encargado, igual que el resto de lo que es
  // información de reportes (ventas, cortes de caja).
  obtenerTiempos(ordenId: number): Observable<TiempoEstadoOrden[]> {
    return this.http.get<TiempoEstadoOrden[]>(`${this.apiUrl}/ordenes/${ordenId}/tiempos`);
  }

  // GET /api/ordenes/:id/insumos-descontados?lineas=a,b — qué insumos
  // descontarían las líneas indicadas (todas las activas si se omite). Lo usa
  // el checklist de rescate al cancelar una comanda en 'preparando'.
  obtenerInsumosDescontados(
    ordenId: number,
    ordenDetalleIds?: number[],
  ): Observable<InsumoDescontado[]> {
    return this.http.get<InsumoDescontado[]>(
      `${this.apiUrl}/ordenes/${ordenId}/insumos-descontados`,
      {
        params:
          ordenDetalleIds && ordenDetalleIds.length > 0
            ? { lineas: ordenDetalleIds.join(',') }
            : {},
      },
    );
  }
}
