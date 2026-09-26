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
  const injector = inject(Injector);
  const token = localStorage.getItem('token');
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token && !req.url.includes('/auth/login')) {
        injector.get(AuthService).logout('Tu sesión expiró. Vuelve a iniciar sesión.');
      }
      return throwError(() => error);
    }),
  );
};
