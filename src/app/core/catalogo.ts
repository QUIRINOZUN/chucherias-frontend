// =============================================================================
// core/catalogo.ts — SERVICIO DEL MENÚ (categorías y productos)
// =============================================================================
// Trae del backend el menú que el punto de venta muestra. Solo lectura.
// Las peticiones llevan el token automáticamente (core/auth-interceptor.ts).
//
// MODELO: una Categoría agrupa Productos; cada Producto tiene una o más
// Variantes (tamaños/paquetes), y la VARIANTE es lo que se agrega al carrito
// y lo que trae el precio.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Una de las 12 categorías del menú (Hamburguesas, Pizzas, Alitas…).
export interface Categoria {
  id: number;
  nombre: string;
}

// Una presentación vendible de un producto, con su precio real.
export interface Variante {
  id: number;
  nombre: string;
  precio: number;
}

// Un producto del menú con todas sus variantes ya incluidas.
export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  // Foto del producto (Cloudinary). Hoy está vacía en todo el catálogo: el POS
  // muestra entonces un bloque de color con el ícono de la categoría.
  imagen_url: string | null;
  categoria_id: number;
  categoria: string;
  variantes: Variante[];
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  // URL base de la API; cambia entre desarrollo y producción (environments/).
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/categorias
  obtenerCategorias(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.apiUrl}/categorias`);
  }

  // GET /api/productos — solo productos activos, con sus variantes.
  obtenerProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(`${this.apiUrl}/productos`);
  }
}
