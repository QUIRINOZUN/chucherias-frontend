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

// Respuesta de POST /api/auth/login. Si la cuenta tiene verificación en dos
// pasos y todavía no se mandó el código, llega solo { requiere_codigo: true }.
export interface RespuestaLogin {
  token?: string;
  usuario?: Usuario;
  requiere_codigo?: boolean;
  debe_cambiar_contrasena?: boolean;
  totp_activo?: boolean;
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

  // Seguridad de la cuenta (2026-11-16). debeCambiarContrasena se guarda en
  // localStorage para que una recarga no permita saltarse el cambio obligatorio;
  // el servidor igual lo hace cumplir (403 en todo lo que no sea /auth).
  debeCambiarContrasena = signal(localStorage.getItem('debeCambiarContrasena') === '1');
  totpActivo = signal(false);

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  // Inicia sesión: envía las credenciales y, si el servidor las acepta,
  // guarda el token y el usuario. El componente de login se suscribe al
  // resultado para navegar al dashboard o mostrar el error.
  login(usuario: string, contrasena: string, codigo?: string): Observable<RespuestaLogin> {
    return this.http
      .post<RespuestaLogin>(`${this.apiUrl}/auth/login`, { usuario, contrasena, codigo })
      .pipe(
        // `tap` ejecuta este efecto sin alterar la respuesta que recibe el login.
        tap((respuesta) => {
          // Sin token = el servidor pide el código de dos pasos; no hay sesión todavía.
          if (!respuesta.token || !respuesta.usuario) return;
          localStorage.setItem('token', respuesta.token);
          localStorage.setItem('usuario', JSON.stringify(respuesta.usuario));
          this.usuarioActual.set(respuesta.usuario);
          this.fijarDebeCambiar(!!respuesta.debe_cambiar_contrasena);
          this.totpActivo.set(!!respuesta.totp_activo);
        }),
      );
  }

  private fijarDebeCambiar(valor: boolean): void {
    if (valor) localStorage.setItem('debeCambiarContrasena', '1');
    else localStorage.removeItem('debeCambiarContrasena');
    this.debeCambiarContrasena.set(valor);
  }

  // Vuelve a leer del servidor el estado de seguridad (tras recargar la página).
  refrescarSeguridad(): void {
    this.http
      .get<{ debe_cambiar_contrasena: boolean; totp_activo: boolean }>(`${this.apiUrl}/auth/me`)
      .subscribe({
        next: (r) => {
          this.fijarDebeCambiar(!!r.debe_cambiar_contrasena);
          this.totpActivo.set(!!r.totp_activo);
        },
        error: () => {},
      });
  }

  // ---- Verificación en dos pasos ----
  preparar2fa(): Observable<{ secreto: string; uri: string }> {
    return this.http.post<{ secreto: string; uri: string }>(`${this.apiUrl}/auth/2fa/preparar`, {});
  }

  activar2fa(codigo: string): Observable<{ ok: boolean }> {
    return this.http
      .post<{ ok: boolean }>(`${this.apiUrl}/auth/2fa/activar`, { codigo })
      .pipe(tap(() => this.totpActivo.set(true)));
  }

  desactivar2fa(contrasena: string, codigo: string): Observable<{ ok: boolean }> {
    return this.http
      .post<{ ok: boolean }>(`${this.apiUrl}/auth/2fa/desactivar`, { contrasena, codigo })
      .pipe(tap(() => this.totpActivo.set(false)));
  }

  // Cambia la contraseña de la cuenta en sesión (exige la actual).
  cambiarContrasena(
    contrasenaActual: string,
    contrasenaNueva: string,
  ): Observable<{ ok: boolean }> {
    return this.http
      .patch<{ ok: boolean }>(`${this.apiUrl}/auth/contrasena`, {
        contrasena_actual: contrasenaActual,
        contrasena_nueva: contrasenaNueva,
      })
      .pipe(tap(() => this.fijarDebeCambiar(false)));
  }

  // Cierra la sesión: borra token y usuario y regresa al login.
  // `aviso` es opcional: si se indica (cierre por inactividad o token
  // vencido), la pantalla de login lo muestra para explicar el motivo.
  logout(aviso = ''): void {
    this.avisoSesion.set(aviso);
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('debeCambiarContrasena');
    this.debeCambiarContrasena.set(false);
    this.totpActivo.set(false);
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
