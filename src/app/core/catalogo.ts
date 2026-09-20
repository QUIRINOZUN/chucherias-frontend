import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Variante {
  id: number;
  nombre: string;
  precio: number;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  categoria_id: number;
  categoria: string;
  variantes: Variante[];
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  obtenerCategorias(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.apiUrl}/categorias`);
  }

  obtenerProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(`${this.apiUrl}/productos`);
  }
}
