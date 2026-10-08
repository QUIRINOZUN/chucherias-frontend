// =============================================================================
// usuarios/usuarios.ts — GESTIÓN DE CUENTAS DE PERSONAL (RF-24)
// =============================================================================
// Pantalla "Usuarios". La ven administrador y encargado; solo el ADMINISTRADOR
// ve los controles para crear, editar y activar/desactivar cuentas.
//
// QUÉ HACE
//   - Lista todas las cuentas con su rol y estado.
//   - Un mismo formulario (ventana emergente) sirve para CREAR y para EDITAR:
//     el "modo" decide a qué endpoint se manda y si la contraseña es
//     obligatoria (crear) u opcional (editar: en blanco = no cambiarla).
//   - Activar/desactivar una cuenta: no borra nada, solo impide iniciar sesión.
//   - Eliminar una cuenta (2026-10-08): borrado real, con ventana de
//     confirmación. Solo funciona si la cuenta nunca se usó — el servidor
//     rechaza el borrado (409) si ya tiene historial, y ese mensaje se
//     muestra en la misma ventana en vez de cerrarla.
//
// El formulario usa señales sueltas (nombreForm, usuarioForm…) en vez de un
// FormGroup: la validación es corta y se resume en puedeGuardar().
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { ThemeService } from '../core/theme';
import { EdicionUsuario, NuevoUsuario, Rol, Usuario, UsuariosService } from '../core/usuarios';

// null = formulario cerrado; 'crear' / 'editar' = formulario abierto en ese modo.
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
  // id de la cuenta que se está editando (null cuando se está creando).
  usuarioEditandoId = signal<number | null>(null);
  nombreForm = signal('');
  usuarioForm = signal('');
  contrasenaForm = signal('');
  rolIdForm = signal<number | null>(null);
  procesandoForm = signal(false);
  errorFormulario = signal('');

  // id de la cuenta a la que se está cambiando el estado activo (deshabilita
  // su botón mientras el servidor responde).
  actualizandoId = signal<number | null>(null);

  // Ventana de confirmación de "Eliminar": null = cerrada. Es la única
  // acción irreversible de esta pantalla (desactivar se puede revertir), así
  // que pide confirmar antes de mandar el DELETE — el servidor de todos
  // modos la rechaza si la cuenta ya tiene historial (ver core/usuarios.ts).
  usuarioAEliminar = signal<Usuario | null>(null);
  eliminando = signal(false);
  errorEliminar = signal('');

  // Solo el administrador da de alta, edita o activa/desactiva cuentas
  // (RF-24); encargado ve la lista, sin estos controles.
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');

  constructor(
    private usuariosService: UsuariosService,
    // `public` porque la plantilla necesita saber quién es el usuario actual
    // (para no permitirle desactivar su propia cuenta).
    public authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarUsuarios();
    // El catálogo de roles solo lo puede pedir el administrador (el servidor
    // lo restringe), y solo él lo necesita para el formulario.
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

  // Carga (o recarga) la lista de usuarios desde el servidor.
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

  // Abre el formulario vacío en modo "crear" (el primer rol queda preseleccionado).
  abrirCreacion(): void {
    this.modoFormulario.set('crear');
    this.usuarioEditandoId.set(null);
    this.nombreForm.set('');
    this.usuarioForm.set('');
    this.contrasenaForm.set('');
    this.rolIdForm.set(this.roles()[0]?.id ?? null);
    this.errorFormulario.set('');
  }

  // Abre el formulario en modo "editar", precargado con los datos actuales.
  // La contraseña siempre arranca vacía (nunca se conoce la actual).
  abrirEdicion(usuario: Usuario): void {
    this.modoFormulario.set('editar');
    this.usuarioEditandoId.set(usuario.id);
    this.nombreForm.set(usuario.nombre);
    this.usuarioForm.set(usuario.usuario);
    this.contrasenaForm.set('');
    // La lista trae el NOMBRE del rol; se busca su id para el selector.
    this.rolIdForm.set(this.roles().find((r) => r.nombre === usuario.rol)?.id ?? null);
    this.errorFormulario.set('');
  }

  cerrarFormulario(): void {
    this.modoFormulario.set(null);
  }

  // Decide si el botón "Guardar" está habilitado. Refleja las mismas reglas
  // que valida el servidor (nombre obligatorio, usuario ≥ 3, contraseña ≥ 6).
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
    if (
      this.modoFormulario() === 'editar' &&
      this.contrasenaForm().length > 0 &&
      this.contrasenaForm().length < 6
    ) {
      return false;
    }
    return true;
  }

  // Envía el formulario: crea o edita según el modo actual.
  guardarFormulario(): void {
    if (!this.puedeGuardar()) {
      return;
    }

    this.procesandoForm.set(true);
    this.errorFormulario.set('');

    // Modo "crear": POST /api/usuarios con todos los campos.
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

    // Modo "editar": PATCH /api/usuarios/:id. La contraseña solo se incluye si
    // se escribió una nueva (el `...` agrega la propiedad únicamente entonces).
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

  // Tras guardar: cierra el formulario y recarga la lista para ver el cambio.
  private alGuardarConExito(): void {
    this.procesandoForm.set(false);
    this.modoFormulario.set(null);
    this.cargarUsuarios();
  }

  // Muestra dentro del formulario el mensaje del servidor (ej. "Ese nombre de
  // usuario ya está en uso") o uno genérico si no vino ninguno.
  private alFallarGuardado(error: HttpErrorResponse): void {
    this.procesandoForm.set(false);
    this.errorFormulario.set(error.error?.error || 'Ocurrió un error al guardar el usuario.');
  }

  // Activa o desactiva una cuenta y actualiza esa fila sin recargar la lista.
  alternarActivo(usuario: Usuario): void {
    this.actualizandoId.set(usuario.id);
    this.usuariosService.cambiarActivo(usuario.id, !usuario.activo).subscribe({
      next: (actualizado) => {
        this.actualizandoId.set(null);
        // Solo cambia el campo `activo` de la fila afectada.
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

  abrirConfirmarEliminar(usuario: Usuario): void {
    this.usuarioAEliminar.set(usuario);
    this.errorEliminar.set('');
  }

  cerrarConfirmarEliminar(): void {
    if (this.eliminando()) {
      return;
    }
    this.usuarioAEliminar.set(null);
  }

  // Manda el DELETE. Si el servidor responde 409 (la cuenta ya tiene
  // historial), el mensaje se muestra dentro de esta misma ventana en vez de
  // cerrarla — así el administrador ve de inmediato por qué no se pudo y que
  // debe desactivarla en su lugar.
  confirmarEliminar(): void {
    const usuario = this.usuarioAEliminar();
    if (!usuario || this.eliminando()) {
      return;
    }
    this.eliminando.set(true);
    this.errorEliminar.set('');
    this.usuariosService.eliminar(usuario.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.usuarioAEliminar.set(null);
        this.usuarios.update((lista) => lista.filter((u) => u.id !== usuario.id));
      },
      error: (error: HttpErrorResponse) => {
        this.eliminando.set(false);
        this.errorEliminar.set(error.error?.error || 'No se pudo eliminar el usuario.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
