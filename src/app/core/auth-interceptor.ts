import { HttpInterceptorFn } from '@angular/common/http';

// Se ejecuta automáticamente en CADA petición que haga el frontend.
// Si hay un token guardado, lo agrega como header Authorization.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token');

  if (token) {
    const peticionConToken = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
    return next(peticionConToken);
  }

  return next(req);
};