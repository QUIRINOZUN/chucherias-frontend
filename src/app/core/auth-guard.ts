// =============================================================================
// core/auth-guard.ts — PROTECCIÓN DE RUTAS DEL FRONTEND
// =============================================================================
// Un "guard" decide si el navegador puede entrar a una ruta (URL) de la app.
// Aquí hay dos, y se combinan en app.routes.ts:
//   authGuard      → ¿hay sesión iniciada?   (si no → al login)
//   rolGuard(...)  → ¿el rol del usuario está permitido?  (si no → al dashboard)
//
// Ejemplo (app.routes.ts):
//   canActivate: [authGuard, rolGuard('administrador', 'encargado')]
//
// Esto aplica tanto al navegar por los botones como al escribir la URL a mano.
// OJO: es protección de EXPERIENCIA. La seguridad real está en el backend
// (middleware/auth.js), que rechaza cualquier petición sin permiso aunque
// alguien se salte estos guards.
// =============================================================================
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
// Es una FÁBRICA: recibe la lista de roles y devuelve el guard configurado.
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
