import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth';

// Se coloca en cualquier ruta que requiera sesión iniciada.
// Si no hay sesión, redirige automáticamente al login.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.estaAutenticado()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

// Se coloca junto a authGuard en rutas que además deben limitarse a ciertos
// roles (ej. canActivate: [authGuard, rolGuard('administrador')]). Si el
// usuario no tiene un rol permitido, lo regresa al dashboard en vez de
// dejarlo entrar por URL directa.
export function rolGuard(...rolesPermitidos: string[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const usuario = authService.usuarioActual();
    if (usuario && rolesPermitidos.includes(usuario.rol)) {
      return true;
    }

    router.navigate(['/dashboard']);
    return false;
  };
}