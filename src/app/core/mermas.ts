// =============================================================================
// core/mermas.ts — SERVICIO DE CONSULTA CONSOLIDADA DE MERMAS
// =============================================================================
// Habla con /api/mermas: junta en un solo listado las mermas de PRODUCTO
// (generadas al cancelar una venta) y las de INSUMO (manuales, o por no
// rescatar algo al cancelar una comanda en 'preparando'). Es de solo
// lectura — las mermas se siguen generando desde ventas.ts/insumos.ts.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TipoMerma = 'producto' | 'insumo';

// Una merma tal como la devuelve el servidor, ya combinada (producto o
// insumo). Los montos llegan como texto (NUMERIC de PostgreSQL); los campos
// que no aplican a un tipo llegan null (ej. unidad_medida en una de producto).
export interface Merma {
  id: number;
  fecha: string;
  tipo: TipoMerma;
  nombre: string;
  cantidad: string;
  unidad_medida: string | null;
  motivo: string | null;
  responsable: string;
  // Solo mermas de producto (precio ya congelado × cantidad). Las de insumo
  // no tienen un costo unitario capturado todavía.
  valor_total: string | null;
  // Solo si vino de cancelar una venta.
  numero_orden: string | null;
  estado_orden_previo: string | null;
}

export interface FiltrosMermas {
  desde?: string;
  hasta?: string;
  tipo?: TipoMerma | null;
}

@Injectable({ providedIn: 'root' })
export class MermasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/mermas — filtros opcionales y combinables; solo se envían los
  // que tienen valor.
  listar(filtros: FiltrosMermas = {}): Observable<Merma[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) {
      params['desde'] = filtros.desde;
    }
    if (filtros.hasta) {
      params['hasta'] = filtros.hasta;
    }
    if (filtros.tipo) {
      params['tipo'] = filtros.tipo;
    }
    return this.http.get<Merma[]>(`${this.apiUrl}/mermas`, { params });
  }
}
