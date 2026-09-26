import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: string;
}

interface RespuestaLogin {
  token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiUrl;

  // Señal reactiva con el usuario actual (o null si no hay sesión).
  // Cualquier componente puede leerla con authService.usuarioActual()
  usuarioActual = signal<Usuario | null>(this.obtenerUsuarioGuardado());

  // Mensaje que el login muestra tras un cierre automático de sesión
  // (inactividad o token vencido); vacío en un logout normal.
  avisoSesion = signal('');

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  login(usuario: string, contrasena: string): Observable<RespuestaLogin> {
    return this.http
      .post<RespuestaLogin>(`${this.apiUrl}/auth/login`, { usuario, contrasena })
      .pipe(
        tap((respuesta) => {
          localStorage.setItem('token', respuesta.token);
          localStorage.setItem('usuario', JSON.stringify(respuesta.usuario));
          this.usuarioActual.set(respuesta.usuario);
        }),
      );
  }

  logout(aviso = ''): void {
    this.avisoSesion.set(aviso);
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.usuarioActual.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  estaAutenticado(): boolean {
    return !!this.getToken();
  }

  private obtenerUsuarioGuardado(): Usuario | null {
    const data = localStorage.getItem('usuario');
    return data ? JSON.parse(data) : null;
  }
}
