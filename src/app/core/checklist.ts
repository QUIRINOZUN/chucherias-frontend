// =============================================================================
// core/checklist.ts — CHECKLIST DE APERTURA/CIERRE (2026-10-16)
// =============================================================================
// Habla con /api/checklist. Pedido explícitamente por la titular en la
// entrevista — ver routes/checklist.js para las reglas completas de quién
// puede marcar (cualquier rol operativo) vs. quién administra el catálogo
// de pasos (administrador/encargado).
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TipoChecklist = 'apertura' | 'cierre';

export interface ChecklistItem {
  id: number;
  tipo: TipoChecklist;
  descripcion: string;
  orden: number;
  activo: boolean;
}

// Un paso del checklist DE HOY, con si ya se marcó.
export interface ChecklistItemHoy extends ChecklistItem {
  marcado: boolean;
  marcado_por_nombre: string | null;
  fecha_marcado: string | null;
}

export interface DatosChecklistItem {
  tipo: TipoChecklist;
  descripcion: string;
  orden?: number;
}

// Una marca del historial (2026-10-16): quién hizo qué paso y a qué hora,
// en cualquier día — distinto de ChecklistItemHoy, que solo es el estado
// de HOY.
export interface MarcaHistorial {
  id: number;
  tipo: TipoChecklist;
  descripcion: string;
  fecha: string;
  marcado_por_nombre: string;
  fecha_marcado: string;
}

export interface FiltrosHistorialChecklist {
  desde?: string;
  hasta?: string;
  tipo?: TipoChecklist;
}

@Injectable({ providedIn: 'root' })
export class ChecklistService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/checklist/items?tipo=&todos=1 — catálogo (gestión).
  obtenerItems(tipo?: TipoChecklist, incluirInactivos = false): Observable<ChecklistItem[]> {
    const params: Record<string, string> = {};
    if (tipo) {
      params['tipo'] = tipo;
    }
    if (incluirInactivos) {
      params['todos'] = '1';
    }
    return this.http.get<ChecklistItem[]>(`${this.apiUrl}/checklist/items`, { params });
  }

  // GET /api/checklist/hoy?tipo= — catálogo de hoy con su estado.
  obtenerHoy(tipo: TipoChecklist): Observable<ChecklistItemHoy[]> {
    return this.http.get<ChecklistItemHoy[]>(`${this.apiUrl}/checklist/hoy`, { params: { tipo } });
  }

  // POST /api/checklist/marcar — marca un paso como hecho hoy.
  marcar(itemId: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiUrl}/checklist/marcar`, { item_id: itemId });
  }

  // DELETE /api/checklist/marcar/:itemId — desmarca (por si se equivocaron).
  desmarcar(itemId: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/checklist/marcar/${itemId}`);
  }

  // POST /api/checklist/items — administrador/encargado.
  crearItem(datos: DatosChecklistItem): Observable<ChecklistItem> {
    return this.http.post<ChecklistItem>(`${this.apiUrl}/checklist/items`, datos);
  }

  // PATCH /api/checklist/items/:id — administrador/encargado.
  editarItem(
    id: number,
    datos: Partial<DatosChecklistItem & { activo: boolean }>,
  ): Observable<ChecklistItem> {
    return this.http.patch<ChecklistItem>(`${this.apiUrl}/checklist/items/${id}`, datos);
  }

  // GET /api/checklist/historial?desde=&hasta=&tipo= — administrador/
  // encargado. Sin filtros, TODO el histórico (mismo criterio que
  // MermasService.listar()).
  obtenerHistorial(filtros: FiltrosHistorialChecklist): Observable<MarcaHistorial[]> {
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
    return this.http.get<MarcaHistorial[]>(`${this.apiUrl}/checklist/historial`, { params });
  }
}
