import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  rol: string;
  activo: boolean;
  fecha_creacion: string;
}

export interface Rol {
  id: number;
  nombre: string;
}

export interface NuevoUsuario {
  nombre: string;
  usuario: string;
  contrasena: string;
  rol_id: number;
}

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

  listar(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(`${this.apiUrl}/usuarios`);
  }

  listarRoles(): Observable<Rol[]> {
    return this.http.get<Rol[]>(`${this.apiUrl}/usuarios/roles`);
  }

  crear(datos: NuevoUsuario): Observable<Usuario> {
    return this.http.post<Usuario>(`${this.apiUrl}/usuarios`, datos);
  }

  editar(id: number, datos: EdicionUsuario): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${id}`, datos);
  }

  cambiarActivo(id: number, activo: boolean): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${id}/activo`, { activo });
  }
}
