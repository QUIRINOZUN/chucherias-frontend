// =============================================================================
// core/auth-interceptor.ts — TOKEN AUTOMÁTICO EN CADA PETICIÓN HTTP
// =============================================================================
// Un "interceptor" se ejecuta con TODAS las peticiones HTTP que hace el
// frontend (se registra una sola vez en app.config.ts). Este hace dos cosas:
//   1. SALIDA: si hay sesión, agrega el header  Authorization: Bearer <token>.
//      Por eso ningún servicio (ventas, caja…) tiene que ocuparse del token.
//   2. ENTRADA: si el servidor responde 401 (token vencido o inválido) con la
//      sesión abierta, cierra la sesión y manda al login (RNF-01).
// =============================================================================
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth';

// Se ejecuta automáticamente en CADA petición que haga el frontend.
// Si hay un token guardado, lo agrega como header Authorization.
// Si el servidor responde 401 con una sesión iniciada (token vencido o
// inválido), cierra la sesión y manda al login (RNF-01). El login mismo
// queda fuera: ahí un 401 solo significa "credenciales incorrectas".
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Se toma el Injector en lugar de inyectar AuthService directamente: así se
  // evita una dependencia circular (AuthService usa HttpClient, que a su vez
  // usa este interceptor). El servicio se obtiene solo cuando hace falta.
  const injector = inject(Injector);
  const token = localStorage.getItem('token');
  // Las peticiones son inmutables: para agregar el header se clona la original.
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo cuenta como "sesión vencida" si HABÍA token y la petición no era
      // el propio login.
      if (error.status === 401 && token && !req.url.includes('/auth/login')) {
        injector.get(AuthService).logout('Tu sesión expiró. Vuelve a iniciar sesión.');
      }
      // El error se relanza para que el componente que hizo la petición
      // también pueda reaccionar (mostrar su mensaje, apagar su spinner…).
      return throwError(() => error);
    }),
  );
};
