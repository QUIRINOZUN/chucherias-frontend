// =============================================================================
// core/insumos.ts — SERVICIO DE INVENTARIO
// =============================================================================
// Habla con /api/insumos. Solo lo usa la pantalla "Inventario"
// (administrador/encargado, igual que el servidor lo restringe).
//
// La existencia de cada insumo NO se guarda como número: la calcula el
// servidor sumando movimientos_inventario (entrada + ajuste − salida −
// merma) cada vez que se pide la lista.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Una categoría de insumo (dominio de inventario — distinto de `categorias`,
// que es el catálogo de categorías del MENÚ). Agrupa la pantalla de
// Inventario: proteínas, lácteos, salsas, etc.
export interface CategoriaInsumo {
  id: number;
  nombre: string;
}

// Un insumo con su existencia ya calculada por el servidor.
export interface Insumo {
  id: number;
  nombre: string;
  unidad_medida: string;
  cantidad_minima: number;
  proveedor_id: number | null;
  proveedor: string | null;
  categoria_id: number | null;
  categoria: string | null;
  existencia: number;
  // true si existencia <= cantidad_minima: necesita reabastecerse.
  alerta: boolean;
}

// Datos para crear/editar un insumo.
export interface DatosInsumo {
  nombre: string;
  unidad_medida: string;
  cantidad_minima: number;
  proveedor_id: number | null;
  categoria_id: number | null;
}

// Un renglón del historial de movimientos de un insumo.
export interface MovimientoInventario {
  id: number;
  tipo: 'entrada' | 'salida' | 'ajuste' | 'merma';
  cantidad: string; // NUMERIC llega como texto
  fecha: string;
  motivo: string | null;
  responsable: string;
}

@Injectable({ providedIn: 'root' })
export class InsumosService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/insumos
  listar(): Observable<Insumo[]> {
    return this.http.get<Insumo[]>(`${this.apiUrl}/insumos`);
  }

  // GET /api/insumos/categorias — para agrupar la lista y el selector del formulario.
  listarCategorias(): Observable<CategoriaInsumo[]> {
    return this.http.get<CategoriaInsumo[]>(`${this.apiUrl}/insumos/categorias`);
  }

  // GET /api/insumos/:id/movimientos
  listarMovimientos(id: number): Observable<MovimientoInventario[]> {
    return this.http.get<MovimientoInventario[]>(`${this.apiUrl}/insumos/${id}/movimientos`);
  }

  // POST /api/insumos
  crear(datos: DatosInsumo): Observable<Insumo> {
    return this.http.post<Insumo>(`${this.apiUrl}/insumos`, datos);
  }

  // PATCH /api/insumos/:id
  editar(id: number, datos: DatosInsumo): Observable<Insumo> {
    return this.http.patch<Insumo>(`${this.apiUrl}/insumos/${id}`, datos);
  }

  // POST /api/insumos/:id/entrada — registrar mercancía recibida.
  registrarEntrada(id: number, cantidad: number, motivo: string): Observable<MovimientoInventario> {
    return this.http.post<MovimientoInventario>(`${this.apiUrl}/insumos/${id}/entrada`, {
      cantidad,
      motivo,
    });
  }

  // POST /api/insumos/:id/ajuste — corrección manual (+/-), motivo obligatorio.
  registrarAjuste(id: number, cantidad: number, motivo: string): Observable<MovimientoInventario> {
    return this.http.post<MovimientoInventario>(`${this.apiUrl}/insumos/${id}/ajuste`, {
      cantidad,
      motivo,
    });
  }

  // POST /api/insumos/:id/merma — merma manual (RF-13: se cayó, caducó, etc.,
  // independiente de una venta cancelada). cantidad siempre positiva, motivo
  // obligatorio.
  registrarMerma(id: number, cantidad: number, motivo: string): Observable<MovimientoInventario> {
    return this.http.post<MovimientoInventario>(`${this.apiUrl}/insumos/${id}/merma`, {
      cantidad,
      motivo,
    });
  }
}
