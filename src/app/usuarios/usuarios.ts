import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { ThemeService } from '../core/theme';
import { EdicionUsuario, NuevoUsuario, Rol, Usuario, UsuariosService } from '../core/usuarios';

type ModoFormulario = 'crear' | 'editar' | null;

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css',
})
export class UsuariosComponent implements OnInit {
  usuarios = signal<Usuario[]>([]);
  roles = signal<Rol[]>([]);
  cargando = signal(true);
  error = signal('');

  // Un solo formulario sirve para dar de alta y para editar; el modo decide
  // a qué endpoint se manda y si la contraseña es obligatoria u opcional.
  modoFormulario = signal<ModoFormulario>(null);
  usuarioEditandoId = signal<number | null>(null);
  nombreForm = signal('');
  usuarioForm = signal('');
  contrasenaForm = signal('');
  rolIdForm = signal<number | null>(null);
  procesandoForm = signal(false);
  errorFormulario = signal('');

  actualizandoId = signal<number | null>(null);

  // Solo el administrador da de alta, edita o activa/desactiva cuentas
  // (RF-24); encargado ve la lista, sin estos controles.
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');

  constructor(
    private usuariosService: UsuariosService,
    public authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarUsuarios();
    if (this.esAdministrador()) {
      this.usuariosService.listarRoles().subscribe({
        next: (roles) => this.roles.set(roles),
        error: () => {
          // El formulario simplemente no tendrá opciones de rol; el resto
          // de la pantalla (la lista) sigue funcionando.
        },
      });
    }
  }

  cargarUsuarios(): void {
    this.cargando.set(true);
    this.usuariosService.listar().subscribe({
      next: (usuarios) => {
        this.usuarios.set(usuarios);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los usuarios.');
        this.cargando.set(false);
      },
    });
  }

  abrirCreacion(): void {
    this.modoFormulario.set('crear');
    this.usuarioEditandoId.set(null);
    this.nombreForm.set('');
    this.usuarioForm.set('');
    this.contrasenaForm.set('');
    this.rolIdForm.set(this.roles()[0]?.id ?? null);
    this.errorFormulario.set('');
  }

  abrirEdicion(usuario: Usuario): void {
    this.modoFormulario.set('editar');
    this.usuarioEditandoId.set(usuario.id);
    this.nombreForm.set(usuario.nombre);
    this.usuarioForm.set(usuario.usuario);
    this.contrasenaForm.set('');
    this.rolIdForm.set(this.roles().find((r) => r.nombre === usuario.rol)?.id ?? null);
    this.errorFormulario.set('');
  }

  cerrarFormulario(): void {
    this.modoFormulario.set(null);
  }

  puedeGuardar(): boolean {
    if (this.procesandoForm() || this.rolIdForm() == null) {
      return false;
    }
    if (this.nombreForm().trim().length === 0 || this.usuarioForm().trim().length < 3) {
      return false;
    }
    // Al crear, la contraseña es obligatoria; al editar, es opcional
    // (dejarla en blanco significa "no cambiarla").
    if (this.modoFormulario() === 'crear' && this.contrasenaForm().length < 6) {
      return false;
    }
    if (this.modoFormulario() === 'editar' && this.contrasenaForm().length > 0 && this.contrasenaForm().length < 6) {
      return false;
    }
    return true;
  }

  guardarFormulario(): void {
    if (!this.puedeGuardar()) {
      return;
    }

    this.procesandoForm.set(true);
    this.errorFormulario.set('');

    if (this.modoFormulario() === 'crear') {
      const datos: NuevoUsuario = {
        nombre: this.nombreForm().trim(),
        usuario: this.usuarioForm().trim(),
        contrasena: this.contrasenaForm(),
        rol_id: this.rolIdForm()!,
      };
      this.usuariosService.crear(datos).subscribe({
        next: () => this.alGuardarConExito(),
        error: (error: HttpErrorResponse) => this.alFallarGuardado(error),
      });
      return;
    }

    const datos: EdicionUsuario = {
      nombre: this.nombreForm().trim(),
      usuario: this.usuarioForm().trim(),
      rol_id: this.rolIdForm()!,
      ...(this.contrasenaForm() ? { contrasena: this.contrasenaForm() } : {}),
    };
    this.usuariosService.editar(this.usuarioEditandoId()!, datos).subscribe({
      next: () => this.alGuardarConExito(),
      error: (error: HttpErrorResponse) => this.alFallarGuardado(error),
    });
  }

  private alGuardarConExito(): void {
    this.procesandoForm.set(false);
    this.modoFormulario.set(null);
    this.cargarUsuarios();
  }

  private alFallarGuardado(error: HttpErrorResponse): void {
    this.procesandoForm.set(false);
    this.errorFormulario.set(error.error?.error || 'Ocurrió un error al guardar el usuario.');
  }

  alternarActivo(usuario: Usuario): void {
    this.actualizandoId.set(usuario.id);
    this.usuariosService.cambiarActivo(usuario.id, !usuario.activo).subscribe({
      next: (actualizado) => {
        this.actualizandoId.set(null);
        this.usuarios.update((lista) =>
          lista.map((u) => (u.id === actualizado.id ? { ...u, activo: actualizado.activo } : u)),
        );
      },
      error: () => {
        this.actualizandoId.set(null);
        this.error.set('No se pudo actualizar el estado del usuario.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
