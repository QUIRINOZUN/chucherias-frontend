// =============================================================================
// app.config.ts — CONFIGURACIÓN GLOBAL DE ANGULAR
// =============================================================================
// Aquí se registran los "proveedores" que toda la aplicación necesita desde el
// arranque (se carga en main.ts). Solo hay tres:
//   1. Escucha global de errores del navegador.
//   2. El enrutador, con la tabla de rutas de app.routes.ts.
//   3. El cliente HTTP, con el interceptor que agrega el token a CADA petición
//      y cierra la sesión si el servidor responde 401.
// =============================================================================
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Navegación entre pantallas (ver app.routes.ts).
    provideRouter(routes),
    // Todas las peticiones HTTP pasan por authInterceptor: por eso ningún
    // servicio necesita agregar el token a mano.
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
