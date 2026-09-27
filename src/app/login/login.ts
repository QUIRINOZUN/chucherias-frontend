// =============================================================================
// login/login.ts — PANTALLA DE INICIO DE SESIÓN
// =============================================================================
// Es la primera pantalla y la única pública. Muestra un formulario de usuario y
// contraseña con validación reactiva, y se apoya en AuthService para iniciar
// sesión.
//
// FLUJO
//   1. La persona escribe usuario y contraseña (validación al tocar cada campo).
//   2. Al enviar, si el formulario es inválido se marcan los errores y no se
//      manda nada; si es válido se llama a authService.login().
//   3. Éxito → se navega a /dashboard. Error → se muestra un mensaje claro
//      según el tipo de fallo (sin conexión, credenciales, cuenta desactivada).
//
// Si se llegó aquí porque la sesión se cerró sola (inactividad o token
// vencido), el motivo aparece arriba del formulario (AuthService.avisoSesion).
// =============================================================================
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
  // Mensaje de error general que se muestra encima del botón (vacío = sin error).
  error = signal('');
  // true mientras se espera la respuesta del servidor (activa el spinner y
  // deshabilita el botón para evitar envíos dobles).
  cargando = signal(false);
  // Alterna el campo de contraseña entre texto oculto y visible.
  mostrarContrasena = signal(false);

  form: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    // Si se llegó aquí por un cierre automático de sesión, se explica por qué.
    // El aviso se consume (se limpia) para que no reaparezca en el siguiente
    // cierre manual.
    this.error.set(this.authService.avisoSesion());
    this.authService.avisoSesion.set('');
    // Reglas de validación: ambos obligatorios; usuario mínimo 3 caracteres y
    // contraseña mínimo 6 (coincide con la regla del backend al editar).
    this.form = this.fb.group({
      usuario: ['', [Validators.required, Validators.minLength(3)]],
      contrasena: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  // El error de un campo solo se muestra después de que la persona lo toca,
  // para no mostrar un formulario "lleno de rojo" al abrir la pantalla.
  get usuarioInvalido(): boolean {
    const control = this.form.get('usuario')!;
    return control.invalid && control.touched;
  }

  get contrasenaInvalida(): boolean {
    const control = this.form.get('contrasena')!;
    return control.invalid && control.touched;
  }

  // Botón "Mostrar / Ocultar" de la contraseña.
  alternarVisibilidadContrasena(): void {
    this.mostrarContrasena.update((valor) => !valor);
  }

  // Se ejecuta al enviar el formulario (botón "Ingresar" o tecla Enter).
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
        // AuthService ya guardó token y usuario; solo queda entrar al sistema.
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
    // status 0 = la petición nunca obtuvo respuesta (sin Internet, o Render
    // todavía "despertando" en el primer uso del día).
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
