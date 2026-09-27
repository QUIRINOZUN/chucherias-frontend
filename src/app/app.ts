// =============================================================================
// app.ts — COMPONENTE RAÍZ (<app-root>)
// =============================================================================
// Es el contenedor de toda la aplicación. Su plantilla (app.html) contiene:
//   - <router-outlet>: el lugar donde Angular pinta la pantalla actual
//     (login, dashboard, POS, caja…).
//   - El aviso global de "tu sesión se cerrará por inactividad" (RNF-01).
//
// Su única lógica es encender o apagar el control de inactividad según haya o
// no una sesión iniciada.
// =============================================================================
import { Component, effect, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth';
import { InactividadService } from './core/inactividad';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('chucherias-frontend');

  constructor(
    private authService: AuthService,
    // `protected` para que la plantilla pueda leer segundosRestantes y llamar
    // a continuarSesion() desde el aviso de inactividad.
    protected inactividad: InactividadService,
  ) {
    // El control de inactividad solo corre mientras hay sesión iniciada
    // (incluye recargar la página con un token guardado).
    // `effect` se vuelve a ejecutar cada vez que cambia usuarioActual: al
    // iniciar sesión arranca el temporizador; al cerrarla, se detiene.
    effect(() => {
      if (this.authService.usuarioActual()) {
        this.inactividad.iniciar();
      } else {
        this.inactividad.detener();
      }
    });
  }
}
