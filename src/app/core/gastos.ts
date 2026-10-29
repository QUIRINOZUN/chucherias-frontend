// =============================================================================
// core/gastos.ts — SERVICIO DE GASTOS GENERALES DEL NEGOCIO (2026-10-28)
// =============================================================================
// Habla con /api/gastos. Renta, servicios, mantenimiento, compras no ligadas
// a una venta ni a un insumo de receta — deliberadamente AISLADO de caja
// (ver routes/gastos.js para el detalle de la decisión de alcance). Permisos
// (los aplica el servidor): solo administrador y encargado.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type FormaPagoGasto = 'efectivo' | 'transferencia';

export interface CategoriaGasto {
  id: number;
  nombre: string;
}

export interface Gasto {
  id: number;
  categoria_id: number;
  categoria: string;
  concepto: string;
  monto: number;
  fecha: string; // AAAA-MM-DD
  forma_pago: FormaPagoGasto;
  es_recurrente: boolean;
  proveedor_id: number | null;
  proveedor_nombre: string | null;
  nota: string | null;
  registrado_por: number;
  registrado_por_nombre: string;
  fecha_registro: string;
  editado_por: number | null;
  editado_por_nombre: string | null;
  fecha_edicion: string | null;
}

export interface FiltrosGastos {
  desde?: string;
  hasta?: string;
  categoria_id?: number;
  forma_pago?: FormaPagoGasto;
  proveedor_id?: number;
  buscar?: string;
}

export interface DatosNuevoGasto {
  categoria_id: number;
  concepto: string;
  monto: number;
  fecha: string;
  forma_pago: FormaPagoGasto;
  es_recurrente?: boolean;
  proveedor_id?: number | null;
  nota?: string | null;
}

// Edición parcial: todo opcional, lo que no llega conserva su valor actual
// (mismo criterio que el resto de PATCH de este proyecto).
export type DatosEdicionGasto = Partial<DatosNuevoGasto>;

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/gastos/categorias
  listarCategorias(): Observable<CategoriaGasto[]> {
    return this.http.get<CategoriaGasto[]>(`${this.apiUrl}/gastos/categorias`);
  }

  // POST /api/gastos/categorias
  crearCategoria(nombre: string): Observable<CategoriaGasto> {
    return this.http.post<CategoriaGasto>(`${this.apiUrl}/gastos/categorias`, { nombre });
  }

  // GET /api/gastos?desde=&hasta=&categoria_id=&forma_pago=&proveedor_id=&buscar=
  listar(filtros: FiltrosGastos = {}): Observable<Gasto[]> {
    const params: Record<string, string> = {};
    if (filtros.desde) params['desde'] = filtros.desde;
    if (filtros.hasta) params['hasta'] = filtros.hasta;
    if (filtros.categoria_id != null) params['categoria_id'] = String(filtros.categoria_id);
    if (filtros.forma_pago) params['forma_pago'] = filtros.forma_pago;
    if (filtros.proveedor_id != null) params['proveedor_id'] = String(filtros.proveedor_id);
    if (filtros.buscar) params['buscar'] = filtros.buscar;
    return this.http.get<Gasto[]>(`${this.apiUrl}/gastos`, { params });
  }

  // POST /api/gastos
  crear(datos: DatosNuevoGasto): Observable<Gasto> {
    return this.http.post<Gasto>(`${this.apiUrl}/gastos`, datos);
  }

  // PATCH /api/gastos/:id
  editar(id: number, datos: DatosEdicionGasto): Observable<Gasto> {
    return this.http.patch<Gasto>(`${this.apiUrl}/gastos/${id}`, datos);
  }

  // DELETE /api/gastos/:id
  eliminar(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/gastos/${id}`);
  }
}
