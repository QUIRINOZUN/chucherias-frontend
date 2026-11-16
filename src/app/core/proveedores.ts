// =============================================================================
// core/proveedores.ts — SERVICIO DE PROVEEDORES
// =============================================================================
// Habla con /api/proveedores. Lo usa la pantalla "Inventario" para el
// selector de proveedor en el formulario de insumos.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Proveedor {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
}

export interface NuevoProveedor {
  nombre: string;
  contacto?: string;
  telefono?: string;
}

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/proveedores
  listar(): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>(`${this.apiUrl}/proveedores`);
  }

  // POST /api/proveedores
  crear(datos: NuevoProveedor): Observable<Proveedor> {
    return this.http.post<Proveedor>(`${this.apiUrl}/proveedores`, datos);
  }

  // PATCH /api/proveedores/:id — corrige nombre, contacto o teléfono.
  editar(id: number, datos: Partial<NuevoProveedor>): Observable<Proveedor> {
    return this.http.patch<Proveedor>(`${this.apiUrl}/proveedores/${id}`, datos);
  }

  // DELETE /api/proveedores/:id — 409 si ya está ligado a insumos, compras o gastos.
  eliminar(id: number): Observable<{ id: number; eliminado: boolean }> {
    return this.http.delete<{ id: number; eliminado: boolean }>(`${this.apiUrl}/proveedores/${id}`);
  }
}
