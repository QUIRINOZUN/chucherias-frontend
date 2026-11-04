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

  // AVISO DE CONEXIÓN (2026-11-04): el sistema necesita internet para cobrar.
  // Cuando el navegador detecta que se cayó, se avisa de inmediato en TODAS las
  // pantallas (así el cajero sabe al instante que debe anotar en la libreta en
  // vez de descubrirlo al fallar un cobro), y al volver se confirma unos
  // segundos. Es la señal del propio navegador: no detecta un internet
  // "conectado pero sin salida", para ese caso el POS ya muestra su mensaje.
  protected readonly sinConexion = signal(!navigator.onLine);
  protected readonly reconectado = signal(false);
  private temporizadorReconexion?: ReturnType<typeof setTimeout>;

  constructor(
    private authService: AuthService,
    // `protected` para que la plantilla pueda leer segundosRestantes y llamar
    // a continuarSesion() desde el aviso de inactividad.
    protected inactividad: InactividadService,
  ) {
    // El componente raíz vive mientras la página esté abierta, así que estos
    // listeners no necesitan limpiarse.
    window.addEventListener('offline', () => {
      clearTimeout(this.temporizadorReconexion);
      this.reconectado.set(false);
      this.sinConexion.set(true);
    });
    window.addEventListener('online', () => {
      this.sinConexion.set(false);
      this.reconectado.set(true);
      clearTimeout(this.temporizadorReconexion);
      this.temporizadorReconexion = setTimeout(() => this.reconectado.set(false), 5000);
    });

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
