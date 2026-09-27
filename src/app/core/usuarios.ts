// =============================================================================
// core/usuarios.ts — SERVICIO DE GESTIÓN DE USUARIOS (RF-24)
// =============================================================================
// Habla con /api/usuarios. Lo usa la pantalla "Usuarios" (alta, edición,
// activar/desactivar) y la pantalla de caja (para llenar el filtro de usuario
// del historial de cortes).
//
// Permisos (los aplica el servidor):
//   listar → administrador y encargado.
//   listarRoles, crear, editar, cambiarActivo → solo administrador.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Una cuenta tal como la devuelve la lista (nunca incluye contraseña ni hash).
export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  // Nombre del rol: administrador, encargado, cajero o auxiliar.
  rol: string;
  activo: boolean;
  fecha_creacion: string;
}

// Un rol disponible para el formulario de alta/edición.
export interface Rol {
  id: number;
  nombre: string;
}

// Datos para crear una cuenta (todos obligatorios).
export interface NuevoUsuario {
  nombre: string;
  usuario: string;
  contrasena: string;
  rol_id: number;
}

// Datos para editar una cuenta. La contraseña es opcional: si se omite, se
// conserva la actual.
export interface EdicionUsuario {
  nombre: string;
  usuario: string;
  contrasena?: string;
  rol_id: number;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/usuarios
  listar(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(`${this.apiUrl}/usuarios`);
  }

  // GET /api/usuarios/roles — para el selector de rol del formulario.
  listarRoles(): Observable<Rol[]> {
    return this.http.get<Rol[]>(`${this.apiUrl}/usuarios/roles`);
  }

  // POST /api/usuarios
  crear(datos: NuevoUsuario): Observable<Usuario> {
    return this.http.post<Usuario>(`${this.apiUrl}/usuarios`, datos);
  }

  // PATCH /api/usuarios/:id
  editar(id: number, datos: EdicionUsuario): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${id}`, datos);
  }

  // PATCH /api/usuarios/:id/activo — desactivar no borra nada: la persona solo
  // deja de poder iniciar sesión.
  cambiarActivo(id: number, activo: boolean): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${id}/activo`, { activo });
  }
}
