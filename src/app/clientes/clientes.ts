// =============================================================================
// clientes/clientes.ts — CLIENTES Y PROGRAMA DE LEALTAD (Sprint 4, RF-21 a RF-23)
// =============================================================================
// Pantalla "Clientes". Solo administrador y encargado (igual que Usuarios,
// Inventario, etc. — mismo criterio: es gestión, no una acción de mostrador).
// La búsqueda/alta rápida del cobro (POS) vive en pos/pos.ts, con el mismo
// servicio (ClientesService) pero su propia UI — aquí se CONSULTA el
// catálogo completo (con sus visitas acumuladas), se ve el historial de
// lealtad de cada cliente y se corrige nombre/teléfono si hace falta.
//
// El contador de visitas y los descuentos NUNCA se editan desde aquí: eso
// solo lo calcula el servidor al registrar una venta (routes/ventas.js).
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { Cliente, ClienteDetalle, ClientesService } from '../core/clientes';
import { ConfigLealtad, EscalonLealtad, LealtadService } from '../core/lealtad';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { ThemeService } from '../core/theme';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [DatePipe, CurrencyPipe, FocoDialogoDirective],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class ClientesComponent implements OnInit {
  clientes = signal<Cliente[]>([]);
  cargando = signal(true);
  error = signal('');

  busqueda = signal('');
  private debounceBusquedaId?: ReturnType<typeof setTimeout>;
  private consulta?: Subscription;

  // ---- Ventana de detalle (historial + edición) ----------------------------
  clienteDetalleId = signal<number | null>(null);
  clienteDetalle = signal<ClienteDetalle | null>(null);
  cargandoDetalle = signal(false);
  errorDetalle = signal('');

  editando = signal(false);
  nombreEditForm = signal('');
  telefonoEditForm = signal('');
  guardandoEdicion = signal(false);
  errorEdicion = signal('');

  // ---- Eliminar historial (2026-10-29): solo administrador, irreversible ----
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');
  mostrarEliminarHistorial = signal(false);
  desdeEliminarHistorial = signal('');
  hastaEliminarHistorial = signal('');
  eliminandoHistorial = signal(false);
  errorEliminarHistorial = signal('');
  resultadoEliminarHistorial = signal<string | null>(null);

  // ---- Configuración del programa de lealtad (2026-10-31) -----------------
  // Se carga siempre (cualquier admin/encargado que abra esta pantalla puede
  // editarla), tanto para alimentar la barra de progreso del detalle
  // (ya no asume "ciclo de 10") como para la ventana de configuración.
  configLealtad = signal<ConfigLealtad | null>(null);
  escalones = signal<EscalonLealtad[]>([]);

  mostrarConfigLealtad = signal(false);
  cicloVisitasForm = signal(10);
  montoMinimoForm = signal(100);
  guardandoConfigLealtad = signal(false);
  errorConfigLealtad = signal('');

  // Formulario para agregar/editar UN escalón a la vez, dentro de la misma
  // ventana de configuración. `formEscalonAbierto` decide si se ve el
  // formulario; `escalonEditandoId` en null (con el formulario abierto)
  // significa "creando uno nuevo", con un id significa "editando ese".
  formEscalonAbierto = signal(false);
  escalonEditandoId = signal<number | null>(null);
  visitaEscalonForm = signal(1);
  porcentajeEscalonForm = signal(5);
  descripcionEscalonForm = signal('');
  guardandoEscalon = signal(false);
  errorEscalon = signal('');
  confirmarEliminarEscalonId = signal<number | null>(null);

  constructor(
    private clientesService: ClientesService,
    private lealtadService: LealtadService,
    private authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarClientes();
    this.cargarConfigLealtad();
  }

  // ===========================================================================
  // CONFIGURACIÓN DEL PROGRAMA DE LEALTAD
  // ===========================================================================
  cargarConfigLealtad(): void {
    this.lealtadService.obtenerConfig().subscribe({
      next: (config) => this.configLealtad.set(config),
      error: () => {
        // La barra de progreso del detalle cae a su valor por default (10)
        // si esto falla; el resto de la pantalla sigue funcionando.
      },
    });
    this.lealtadService.listarEscalones().subscribe({
      next: (escalones) => this.escalones.set(escalones),
      error: () => {},
    });
  }

  abrirConfigLealtad(): void {
    const config = this.configLealtad();
    this.cicloVisitasForm.set(config?.ciclo_visitas ?? 10);
    this.montoMinimoForm.set(config?.monto_minimo_compra ?? 100);
    this.errorConfigLealtad.set('');
    this.cancelarFormularioEscalon();
    this.mostrarConfigLealtad.set(true);
  }

  cerrarConfigLealtad(): void {
    if (this.guardandoConfigLealtad()) return;
    this.mostrarConfigLealtad.set(false);
  }

  guardarConfigLealtad(): void {
    if (this.cicloVisitasForm() <= 0 || this.montoMinimoForm() < 0) {
      this.errorConfigLealtad.set(
        'El ciclo debe ser mayor a cero y el monto mínimo no puede ser negativo.',
      );
      return;
    }
    this.guardandoConfigLealtad.set(true);
    this.errorConfigLealtad.set('');
    this.lealtadService
      .actualizarConfig({
        ciclo_visitas: this.cicloVisitasForm(),
        monto_minimo_compra: this.montoMinimoForm(),
      })
      .subscribe({
        next: (config) => {
          this.configLealtad.set(config);
          this.guardandoConfigLealtad.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.guardandoConfigLealtad.set(false);
          this.errorConfigLealtad.set(error.error?.error || 'No se pudo guardar la configuración.');
        },
      });
  }

  // ---- Escalones (en qué visita, qué % de descuento) -----------------------
  abrirNuevoEscalon(): void {
    this.escalonEditandoId.set(null);
    this.visitaEscalonForm.set(1);
    this.porcentajeEscalonForm.set(5);
    this.descripcionEscalonForm.set('');
    this.errorEscalon.set('');
    this.formEscalonAbierto.set(true);
  }

  abrirEditarEscalon(escalon: EscalonLealtad): void {
    this.escalonEditandoId.set(escalon.id);
    this.visitaEscalonForm.set(escalon.visita_numero);
    this.porcentajeEscalonForm.set(escalon.porcentaje_descuento);
    this.descripcionEscalonForm.set(escalon.descripcion ?? '');
    this.errorEscalon.set('');
    this.formEscalonAbierto.set(true);
  }

  cancelarFormularioEscalon(): void {
    this.formEscalonAbierto.set(false);
    this.escalonEditandoId.set(null);
  }

  guardarEscalon(): void {
    if (
      this.visitaEscalonForm() <= 0 ||
      this.porcentajeEscalonForm() <= 0 ||
      this.porcentajeEscalonForm() > 100
    ) {
      this.errorEscalon.set(
        'La visita debe ser mayor a cero y el porcentaje debe estar entre 1 y 100.',
      );
      return;
    }
    const datos = {
      visita_numero: this.visitaEscalonForm(),
      porcentaje_descuento: this.porcentajeEscalonForm(),
      descripcion: this.descripcionEscalonForm().trim() || null,
    };
    this.guardandoEscalon.set(true);
    this.errorEscalon.set('');

    const id = this.escalonEditandoId();
    const peticion = id
      ? this.lealtadService.editarEscalon(id, datos)
      : this.lealtadService.crearEscalon(datos);
    peticion.subscribe({
      next: (escalon) => {
        this.guardandoEscalon.set(false);
        this.escalones.update((lista) => {
          const sinEste = lista.filter((e) => e.id !== escalon.id);
          return [...sinEste, escalon].sort((a, b) => a.visita_numero - b.visita_numero);
        });
        this.cancelarFormularioEscalon();
      },
      error: (error: HttpErrorResponse) => {
        this.guardandoEscalon.set(false);
        this.errorEscalon.set(error.error?.error || 'No se pudo guardar el escalón.');
      },
    });
  }

  pedirEliminarEscalon(id: number): void {
    this.confirmarEliminarEscalonId.set(id);
  }

  cancelarEliminarEscalon(): void {
    this.confirmarEliminarEscalonId.set(null);
  }

  confirmarEliminarEscalon(): void {
    const id = this.confirmarEliminarEscalonId();
    if (!id) return;
    this.lealtadService.eliminarEscalon(id).subscribe({
      next: () => {
        this.escalones.update((lista) => lista.filter((e) => e.id !== id));
        this.confirmarEliminarEscalonId.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.errorConfigLealtad.set(error.error?.error || 'No se pudo eliminar el escalón.');
        this.confirmarEliminarEscalonId.set(null);
      },
    });
  }

  // Typeahead con un pequeño retraso, para no consultar al servidor en cada
  // tecla (mismo patrón que la búsqueda de lealtad del POS).
  actualizarBusqueda(texto: string): void {
    this.busqueda.set(texto);
    clearTimeout(this.debounceBusquedaId);
    this.debounceBusquedaId = setTimeout(() => this.cargarClientes(), 300);
  }

  cargarClientes(): void {
    // Si se vuelve a buscar antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja no debe pisar el resultado más reciente.
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');
    this.consulta = this.clientesService.listar(this.busqueda().trim() || undefined).subscribe({
      next: (clientes) => {
        this.clientes.set(clientes);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : error.error?.error || 'No se pudieron cargar los clientes.',
        );
        this.cargando.set(false);
      },
    });
  }

  // ===========================================================================
  // DETALLE (historial de lealtad) y EDICIÓN (nombre/teléfono)
  // ===========================================================================

  // Tarjeta de lealtad: una casilla por visita del ciclo (largo configurable);
  // las llenas son visitas ya hechas y las que coinciden con un escalón de
  // descuento llevan un aro extra.
  sellosDe(visitas: number): { llena: boolean; escalon: boolean; numero: number }[] {
    const ciclo = this.configLealtad()?.ciclo_visitas ?? 10;
    const visitasEscalon = new Set(this.escalones().map((e) => e.visita_numero));
    return Array.from({ length: ciclo }, (_, i) => ({
      numero: i + 1,
      llena: i < visitas,
      escalon: visitasEscalon.has(i + 1),
    }));
  }

  // Pestaña del detalle de un cliente: su tarjeta de lealtad o sus compras.
  pestanaDetalle = signal<'lealtad' | 'compras'>('lealtad');

  abrirDetalle(cliente: Cliente): void {
    this.pestanaDetalle.set('lealtad');
    this.clienteDetalleId.set(cliente.id);
    this.clienteDetalle.set(null);
    this.cargandoDetalle.set(true);
    this.errorDetalle.set('');
    this.editando.set(false);

    this.clientesService.obtener(cliente.id).subscribe({
      next: (detalle) => {
        this.clienteDetalle.set(detalle);
        this.cargandoDetalle.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorDetalle.set(error.error?.error || 'No se pudo cargar el cliente.');
        this.cargandoDetalle.set(false);
      },
    });
  }

  cerrarDetalle(): void {
    this.clienteDetalleId.set(null);
    this.clienteDetalle.set(null);
    this.editando.set(false);
  }

  iniciarEdicion(): void {
    const detalle = this.clienteDetalle();
    if (!detalle) {
      return;
    }
    this.nombreEditForm.set(detalle.nombre_completo);
    this.telefonoEditForm.set(detalle.telefono || '');
    this.errorEdicion.set('');
    this.editando.set(true);
  }

  cancelarEdicion(): void {
    this.editando.set(false);
    this.errorEdicion.set('');
  }

  guardarEdicion(): void {
    const detalle = this.clienteDetalle();
    const nombre = this.nombreEditForm().trim();
    if (!detalle || !nombre) {
      this.errorEdicion.set('El nombre del cliente es obligatorio.');
      return;
    }
    this.guardandoEdicion.set(true);
    this.errorEdicion.set('');
    this.clientesService.editar(detalle.id, nombre, this.telefonoEditForm().trim()).subscribe({
      next: (actualizado) => {
        this.guardandoEdicion.set(false);
        this.editando.set(false);
        // Se mezcla el cambio sobre el detalle ya cargado (conserva el
        // historial, que PATCH no vuelve a mandar) y sobre la fila de la
        // lista, para no tener que recargar toda la consulta.
        this.clienteDetalle.set({ ...detalle, ...actualizado });
        this.clientes.update((lista) =>
          lista.map((c) => (c.id === actualizado.id ? { ...c, ...actualizado } : c)),
        );
      },
      error: (error: HttpErrorResponse) => {
        this.guardandoEdicion.set(false);
        this.errorEdicion.set(error.error?.error || 'Error al guardar los cambios.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ---- Eliminar historial (solo administrador, acción irreversible) -------
  // Borra el historial de LEALTAD (visitas/descuentos) — no toca
  // visitas_acumuladas de cada cliente, solo el registro de lo que pasó.
  abrirEliminarHistorial(): void {
    this.mostrarEliminarHistorial.set(true);
    this.desdeEliminarHistorial.set('');
    this.hastaEliminarHistorial.set('');
    this.errorEliminarHistorial.set('');
    this.resultadoEliminarHistorial.set(null);
  }

  cerrarEliminarHistorial(): void {
    if (this.eliminandoHistorial()) return;
    this.mostrarEliminarHistorial.set(false);
  }

  puedeEliminarHistorial(): boolean {
    return (
      !!this.desdeEliminarHistorial() &&
      !!this.hastaEliminarHistorial() &&
      this.hastaEliminarHistorial() >= this.desdeEliminarHistorial() &&
      !this.eliminandoHistorial()
    );
  }

  confirmarEliminarHistorial(): void {
    if (!this.puedeEliminarHistorial()) return;
    this.eliminandoHistorial.set(true);
    this.errorEliminarHistorial.set('');
    this.clientesService
      .eliminarHistorial(this.desdeEliminarHistorial(), this.hastaEliminarHistorial())
      .subscribe({
        next: (respuesta) => {
          this.eliminandoHistorial.set(false);
          this.resultadoEliminarHistorial.set(
            `Se eliminaron ${respuesta.eliminados} evento(s) de lealtad del rango indicado.`,
          );
          // Si había un detalle abierto, su historial de lealtad podría
          // haber cambiado — se vuelve a cargar para reflejarlo.
          if (this.clienteDetalleId() != null) {
            const cliente = this.clientes().find((c) => c.id === this.clienteDetalleId());
            if (cliente) this.abrirDetalle(cliente);
          }
        },
        error: (error: HttpErrorResponse) => {
          this.eliminandoHistorial.set(false);
          this.errorEliminarHistorial.set(
            error.error?.error || 'No se pudo eliminar el historial.',
          );
        },
      });
  }
}
