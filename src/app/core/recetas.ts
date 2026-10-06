// =============================================================================
// core/recetas.ts — SERVICIO DEL RECETARIO (insumos por variante)
// =============================================================================
// Habla con /api/recetas. Permisos (los aplica el servidor): administrador y
// encargado, igual que inventario. Una receta es la lista de insumos que se
// descuenta del inventario al vender una variante (ver
// utils/inventarioOrden.js en el backend) — es 1 receta por VARIANTE, no por
// producto, así que un producto con varios tamaños/paquetes tiene una receta
// por cada uno.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Una variante del menú con el estado de su receta (para la lista principal).
export interface VarianteConReceta {
  variante_id: number;
  variante_nombre: string;
  precio: number;
  producto_id: number;
  producto_nombre: string;
  categoria: string;
  tiene_receta: boolean;
  total_insumos: number;
}

// Una línea de la receta de una variante (GET /variante/:id).
export interface LineaReceta {
  id: number;
  insumo_id: number;
  insumo_nombre: string;
  // Unidad base del insumo (insumos.unidad_medida) — siempre coincide con
  // `unidad_medida` de esta misma línea; no se permite guardar en otra.
  insumo_unidad_base: string;
  cantidad: number;
  unidad_medida: string;
}

// Una línea tal como la arma el formulario antes de guardar.
export interface LineaRecetaForm {
  insumo_id: number;
  cantidad: number;
  unidad_medida: string;
}

@Injectable({ providedIn: 'root' })
export class RecetasService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/recetas — todas las variantes activas, con o sin receta.
  listarVariantes(): Observable<VarianteConReceta[]> {
    return this.http.get<VarianteConReceta[]>(`${this.apiUrl}/recetas`);
  }

  // GET /api/recetas/variante/:id — lista vacía si todavía no tiene receta.
  obtenerReceta(varianteId: number): Observable<LineaReceta[]> {
    return this.http.get<LineaReceta[]>(`${this.apiUrl}/recetas/variante/${varianteId}`);
  }

  // PUT /api/recetas/variante/:id — reemplaza TODA la receta de una vez.
  guardarReceta(varianteId: number, insumos: LineaRecetaForm[]): Observable<LineaReceta[]> {
    return this.http.put<LineaReceta[]>(`${this.apiUrl}/recetas/variante/${varianteId}`, {
      insumos,
    });
  }
}
