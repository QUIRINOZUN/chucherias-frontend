// =============================================================================
// core/auth.ts — SERVICIO DE SESIÓN (AuthService)
// =============================================================================
// Es el "dueño" de la sesión del usuario en el frontend. Cualquier componente
// que necesite saber quién está conectado, iniciar o cerrar sesión, lo hace a
// través de este servicio.
//
// QUÉ GUARDA Y DÓNDE
//   localStorage['token']   → el JWT que entregó el servidor al iniciar sesión.
//   localStorage['usuario'] → los datos del usuario (id, usuario, nombre, rol).
//   usuarioActual (signal)  → copia reactiva del usuario, para que las
//                             pantallas se actualicen solas al entrar/salir.
// Al recargar la página la sesión se restaura leyendo localStorage.
//
// QUIÉN LO USA
//   login.ts (iniciar sesión), auth-guard.ts (proteger rutas),
//   auth-interceptor.ts (leer el token / cerrar sesión ante un 401),
//   inactividad.ts (cerrar por inactividad), dashboard y demás pantallas
//   (mostrar nombre/rol y filtrar según permisos).
// =============================================================================
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

// Los datos del usuario en sesión (los mismos que viajan dentro del token).
export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  // administrador | encargado | cajero | auxiliar
  rol: string;
}

// Respuesta de POST /api/auth/login.
interface RespuestaLogin {
  token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiUrl;

  // Señal reactiva con el usuario actual (o null si no hay sesión).
  // Cualquier componente puede leerla con authService.usuarioActual()
  // Arranca con lo que haya guardado, así una recarga no cierra la sesión.
  usuarioActual = signal<Usuario | null>(this.obtenerUsuarioGuardado());

  // Mensaje que el login muestra tras un cierre automático de sesión
  // (inactividad o token vencido); vacío en un logout normal.
  avisoSesion = signal('');

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  // Inicia sesión: envía las credenciales y, si el servidor las acepta,
  // guarda el token y el usuario. El componente de login se suscribe al
  // resultado para navegar al dashboard o mostrar el error.
  login(usuario: string, contrasena: string): Observable<RespuestaLogin> {
    return this.http
      .post<RespuestaLogin>(`${this.apiUrl}/auth/login`, { usuario, contrasena })
      .pipe(
        // `tap` ejecuta este efecto sin alterar la respuesta que recibe el login.
        tap((respuesta) => {
          localStorage.setItem('token', respuesta.token);
          localStorage.setItem('usuario', JSON.stringify(respuesta.usuario));
          this.usuarioActual.set(respuesta.usuario);
        }),
      );
  }

  // Cierra la sesión: borra token y usuario y regresa al login.
  // `aviso` es opcional: si se indica (cierre por inactividad o token
  // vencido), la pantalla de login lo muestra para explicar el motivo.
  logout(aviso = ''): void {
    this.avisoSesion.set(aviso);
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.usuarioActual.set(null);
    this.router.navigate(['/login']);
  }

  // El token guardado (o null). Lo lee el interceptor en cada petición.
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // true si hay un token guardado. Es lo que consulta authGuard.
  // (Que el token siga siendo VÁLIDO lo decide el servidor; si venció,
  // responde 401 y el interceptor cierra la sesión.)
  estaAutenticado(): boolean {
    return !!this.getToken();
  }

  // Recupera el usuario guardado al arrancar la app (null si no hay sesión).
  private obtenerUsuarioGuardado(): Usuario | null {
    const data = localStorage.getItem('usuario');
    return data ? JSON.parse(data) : null;
  }
}
