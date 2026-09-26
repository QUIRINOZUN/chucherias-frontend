import { Component, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  error = signal('');
  cargando = signal(false);
  mostrarContrasena = signal(false);

  form: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    // Si se llegó aquí por un cierre automático de sesión, se explica por qué.
    this.error.set(this.authService.avisoSesion());
    this.authService.avisoSesion.set('');
    this.form = this.fb.group({
      usuario: ['', [Validators.required, Validators.minLength(3)]],
      contrasena: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  get usuarioInvalido(): boolean {
    const control = this.form.get('usuario')!;
    return control.invalid && control.touched;
  }

  get contrasenaInvalida(): boolean {
    const control = this.form.get('contrasena')!;
    return control.invalid && control.touched;
  }

  alternarVisibilidadContrasena(): void {
    this.mostrarContrasena.update((valor) => !valor);
  }

  onSubmit(): void {
    this.error.set('');

    // Si el formulario no es válido, marca todos los campos como "tocados"
    // para que se muestren los mensajes de error, y no intenta enviar nada.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    const { usuario, contrasena } = this.form.value;

    this.authService.login(usuario!, contrasena!).subscribe({
      next: () => {
        this.cargando.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (error: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(this.interpretarError(error));
      },
    });
  }

  // Traduce el error técnico en un mensaje claro para el usuario final,
  // según qué salió mal exactamente.
  private interpretarError(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.';
    }
    if (error.status === 401) {
      return 'Usuario o contraseña incorrectos.';
    }
    if (error.status === 403) {
      return error.error?.error || 'Esta cuenta está desactivada. Contacta al administrador.';
    }
    return 'Ocurrió un error inesperado. Intenta de nuevo en unos momentos.';
  }
}