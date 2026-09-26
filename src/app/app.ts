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
    protected inactividad: InactividadService,
  ) {
    // El control de inactividad solo corre mientras hay sesión iniciada
    // (incluye recargar la página con un token guardado).
    effect(() => {
      if (this.authService.usuarioActual()) {
        this.inactividad.iniciar();
      } else {
        this.inactividad.detener();
      }
    });
  }
}
