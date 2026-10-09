// =============================================================================
// core/catalogo.ts — SERVICIO DEL MENÚ (categorías, productos, variantes)
// =============================================================================
// Trae del backend el menú que el punto de venta muestra (solo lectura, lo
// usa cualquier rol) y, desde 2026-10-09, también la gestión completa del
// menú (crear/editar/activar-desactivar/eliminar categorías, productos y
// variantes — solo administrador/encargado, lo aplica el servidor) para el
// submódulo "Menú" dentro de Recetario.
//
// MODELO: una Categoría agrupa Productos; cada Producto tiene una o más
// Variantes (tamaños/paquetes), y la VARIANTE es lo que se agrega al carrito
// y lo que trae el precio real.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Una categoría del menú (Hamburguesas, Pizzas, Alitas…) — editable.
export interface Categoria {
  id: number;
  nombre: string;
}

// Una presentación vendible de un producto, con su precio real.
export interface Variante {
  id: number;
  nombre: string;
  precio: number;
  // 2026-10-09: deshabilitar UNA presentación sin ocultar todo el producto.
  activo: boolean;
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
  activo: boolean;
  variantes: Variante[];
}

// Datos para crear/editar un producto (todo opcional al editar: lo que no
// llega conserva su valor actual — ver PATCH /api/productos/:id).
export interface DatosProducto {
  categoria_id?: number;
  nombre?: string;
  descripcion?: string | null;
  imagen_url?: string | null;
}

export interface DatosVariante {
  nombre?: string;
  precio?: number;
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  // URL base de la API; cambia entre desarrollo y producción (environments/).
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ---- Lectura (cualquier rol con sesión) ----

  // GET /api/categorias
  obtenerCategorias(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.apiUrl}/categorias`);
  }

  // GET /api/productos?todos=1 — por default solo activos (con sus variantes
  // activas); incluirInactivos trae también los desactivados, para la
  // pantalla de gestión del menú.
  obtenerProductos(incluirInactivos = false): Observable<Producto[]> {
    const params: Record<string, string> = incluirInactivos ? { todos: '1' } : {};
    return this.http.get<Producto[]>(`${this.apiUrl}/productos`, { params });
  }

  // ---- Gestión del menú (administrador/encargado — 2026-10-09) ----

  // POST /api/categorias
  crearCategoria(nombre: string): Observable<Categoria> {
    return this.http.post<Categoria>(`${this.apiUrl}/categorias`, { nombre });
  }

  // PATCH /api/categorias/:id
  editarCategoria(id: number, nombre: string): Observable<Categoria> {
    return this.http.patch<Categoria>(`${this.apiUrl}/categorias/${id}`, { nombre });
  }

  // DELETE /api/categorias/:id — 409 si todavía tiene productos.
  eliminarCategoria(id: number): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiUrl}/categorias/${id}`);
  }

  // POST /api/productos
  crearProducto(datos: {
    categoria_id: number;
    nombre: string;
    descripcion?: string;
  }): Observable<Producto> {
    return this.http.post<Producto>(`${this.apiUrl}/productos`, datos);
  }

  // PATCH /api/productos/:id
  editarProducto(id: number, datos: DatosProducto): Observable<Producto> {
    return this.http.patch<Producto>(`${this.apiUrl}/productos/${id}`, datos);
  }

  // PATCH /api/productos/:id/activo
  cambiarActivoProducto(id: number, activo: boolean): Observable<Producto> {
    return this.http.patch<Producto>(`${this.apiUrl}/productos/${id}/activo`, { activo });
  }

  // DELETE /api/productos/:id — 409 si todavía tiene variantes.
  eliminarProducto(id: number): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiUrl}/productos/${id}`);
  }

  // POST /api/productos/:productoId/variantes
  crearVariante(productoId: number, nombre: string, precio: number): Observable<Variante> {
    return this.http.post<Variante>(`${this.apiUrl}/productos/${productoId}/variantes`, {
      nombre,
      precio,
    });
  }

  // PATCH /api/variantes/:id
  editarVariante(id: number, datos: DatosVariante): Observable<Variante> {
    return this.http.patch<Variante>(`${this.apiUrl}/variantes/${id}`, datos);
  }

  // PATCH /api/variantes/:id/activo
  cambiarActivoVariante(id: number, activo: boolean): Observable<Variante> {
    return this.http.patch<Variante>(`${this.apiUrl}/variantes/${id}/activo`, { activo });
  }

  // DELETE /api/variantes/:id — 409 si ya tiene ventas registradas.
  eliminarVariante(id: number): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiUrl}/variantes/${id}`);
  }

  // POST /api/productos/:id/imagen (multipart/form-data) — sube/reemplaza
  // la foto en Cloudinary; el servidor borra la anterior si existía. No se
  // fija Content-Type a mano: HttpClient lo arma solo (con el boundary
  // correcto) al ver que el body es un FormData.
  subirImagenProducto(id: number, archivo: File): Observable<Producto> {
    const datos = new FormData();
    datos.append('imagen', archivo);
    return this.http.post<Producto>(`${this.apiUrl}/productos/${id}/imagen`, datos);
  }

  // DELETE /api/productos/:id/imagen — quita la foto (Cloudinary y la base).
  eliminarImagenProducto(id: number): Observable<Producto> {
    return this.http.delete<Producto>(`${this.apiUrl}/productos/${id}/imagen`);
  }
}
