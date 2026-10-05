// =============================================================================
// asistencias/asistencias.ts — CONTROL DE PERSONAL Y ASISTENCIAS (Sprint 3)
// =============================================================================
// Pantalla "Asistencias". Solo administrador y encargado (igual que
// usuarios/inventario/caja — es información de personal). Tres secciones:
//
//   1. HOY: una tarjeta por empleado activo con un botón grande para marcar
//      su entrada o su salida AHORA. El botón decide solo cuál mostrar según
//      si ese empleado ya tiene un registro abierto hoy (asistenciasHoy).
//   2. EMPLEADOS: alta, edición y activar/desactivar — mismo patrón de
//      formulario único crear/editar que ya usa usuarios/usuarios.ts.
//   3. HISTORIAL: filtros de fecha/empleado + un formulario (el mismo que la
//      captura manual) para corregir un registro ya existente.
//
// No existe un flujo de "marca tu propia entrada": no todo empleado tiene
// una cuenta de usuario (`empleados.usuario_id` es opcional), así que quien
// abre o cierra el turno de alguien es siempre administrador/encargado —
// ver la nota de diseño completa en routes/asistencias.js.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import {
  Asistencia,
  AsistenciasService,
  CapturaManualAsistencia,
  CorreccionAsistencia,
  FiltrosAsistencias,
} from '../core/asistencias';
import { DatosEmpleado, Empleado, EmpleadosService } from '../core/empleados';
import { ThemeService } from '../core/theme';

type ModoFormularioEmpleado = 'crear' | 'editar' | null;
type ModoFormularioAsistencia = 'crear' | 'editar' | null;

@Component({
  selector: 'app-asistencias',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './asistencias.html',
  styleUrl: './asistencias.css',
})
export class AsistenciasComponent implements OnInit {
  // ---- Datos base ----
  empleados = signal<Empleado[]>([]);
  cargandoEmpleados = signal(true);
  errorEmpleados = signal('');

  asistenciasHoy = signal<Asistencia[]>([]);
  cargandoHoy = signal(true);

  // Solo los activos aparecen en el panel "Hoy" y en el selector de alta
  // de asistencia manual (a uno inactivo no tiene sentido marcarle nada).
  empleadosActivos = computed(() => this.empleados().filter((e) => e.activo));

  // Para cada empleado, su registro de HOY que sigue abierto (sin salida), si
  // tiene uno — decide si el botón dice "Marcar entrada" o "Marcar salida".
  abiertaPorEmpleado = computed(() => {
    const mapa = new Map<number, Asistencia>();
    for (const a of this.asistenciasHoy()) {
      if (!a.hora_salida) {
        mapa.set(a.empleado_id, a);
      }
    }
    return mapa;
  });

  // Cuántas veces ya marcó salida HOY ese empleado (para mostrar "ya
  // trabajó un turno hoy" aunque pueda marcar otro).
  turnosCompletadosHoy(empleadoId: number): number {
    return this.asistenciasHoy().filter((a) => a.empleado_id === empleadoId && a.hora_salida)
      .length;
  }

  // Deshabilita el botón de ESE empleado mientras se procesa su acción.
  procesandoEmpleadoId = signal<number | null>(null);

  constructor(
    private empleadosService: EmpleadosService,
    private asistenciasService: AsistenciasService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarEmpleados();
    this.cargarHoy();
    this.cargarHistorial();
  }

  cargarEmpleados(): void {
    this.cargandoEmpleados.set(true);
    this.empleadosService.listar(this.mostrarInactivos()).subscribe({
      next: (empleados) => {
        this.empleados.set(empleados);
        this.cargandoEmpleados.set(false);
      },
      error: () => {
        this.errorEmpleados.set('No se pudieron cargar los empleados.');
        this.cargandoEmpleados.set(false);
      },
    });
  }

  cargarHoy(): void {
    this.cargandoHoy.set(true);
    this.asistenciasService.listarHoy().subscribe({
      next: (asistencias) => {
        this.asistenciasHoy.set(asistencias);
        this.cargandoHoy.set(false);
      },
      error: () => this.cargandoHoy.set(false),
    });
  }

  // Marca la entrada o la salida de un empleado, según corresponda.
  marcarAsistencia(empleado: Empleado): void {
    this.procesandoEmpleadoId.set(empleado.id);
    const abierta = this.abiertaPorEmpleado().get(empleado.id);

    const accion = abierta
      ? this.asistenciasService.marcarSalida(abierta.id)
      : this.asistenciasService.marcarEntrada(empleado.id);

    accion.subscribe({
      next: () => {
        this.procesandoEmpleadoId.set(null);
        this.cargarHoy();
        this.cargarHistorial();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoEmpleadoId.set(null);
        this.errorEmpleados.set(error.error?.error || 'No se pudo registrar la asistencia.');
      },
    });
  }

  // =====================================================================
  // GESTIÓN DE EMPLEADOS (alta, edición, activar/desactivar)
  // =====================================================================
  mostrarInactivos = signal(false);

  alternarMostrarInactivos(): void {
    this.mostrarInactivos.update((actual) => !actual);
    this.cargarEmpleados();
  }

  modoFormularioEmpleado = signal<ModoFormularioEmpleado>(null);
  empleadoEditandoId = signal<number | null>(null);
  nombreEmpleadoForm = signal('');
  puestoEmpleadoForm = signal('');
  fechaIngresoForm = signal('');
  procesandoFormEmpleado = signal(false);
  errorFormularioEmpleado = signal('');

  actualizandoActivoId = signal<number | null>(null);

  abrirCreacionEmpleado(): void {
    this.modoFormularioEmpleado.set('crear');
    this.empleadoEditandoId.set(null);
    this.nombreEmpleadoForm.set('');
    this.puestoEmpleadoForm.set('');
    this.fechaIngresoForm.set('');
    this.errorFormularioEmpleado.set('');
  }

  abrirEdicionEmpleado(empleado: Empleado): void {
    this.modoFormularioEmpleado.set('editar');
    this.empleadoEditandoId.set(empleado.id);
    this.nombreEmpleadoForm.set(empleado.nombre);
    this.puestoEmpleadoForm.set(empleado.puesto);
    this.fechaIngresoForm.set(empleado.fecha_ingreso);
    this.errorFormularioEmpleado.set('');
  }

  cerrarFormularioEmpleado(): void {
    this.modoFormularioEmpleado.set(null);
  }

  puedeGuardarEmpleado(): boolean {
    if (this.procesandoFormEmpleado()) {
      return false;
    }
    return (
      this.nombreEmpleadoForm().trim().length > 0 &&
      this.puestoEmpleadoForm().trim().length > 0 &&
      this.fechaIngresoForm().length > 0
    );
  }

  guardarFormularioEmpleado(): void {
    if (!this.puedeGuardarEmpleado()) {
      return;
    }
    this.procesandoFormEmpleado.set(true);
    this.errorFormularioEmpleado.set('');

    const datos: DatosEmpleado = {
      nombre: this.nombreEmpleadoForm().trim(),
      puesto: this.puestoEmpleadoForm().trim(),
      fecha_ingreso: this.fechaIngresoForm(),
    };

    const peticion =
      this.modoFormularioEmpleado() === 'crear'
        ? this.empleadosService.crear(datos)
        : this.empleadosService.editar(this.empleadoEditandoId()!, datos);

    peticion.subscribe({
      next: () => {
        this.procesandoFormEmpleado.set(false);
        this.modoFormularioEmpleado.set(null);
        this.cargarEmpleados();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoFormEmpleado.set(false);
        this.errorFormularioEmpleado.set(
          error.error?.error || 'Ocurrió un error al guardar el empleado.',
        );
      },
    });
  }

  alternarActivoEmpleado(empleado: Empleado): void {
    this.actualizandoActivoId.set(empleado.id);
    this.empleadosService.cambiarActivo(empleado.id, !empleado.activo).subscribe({
      next: () => {
        this.actualizandoActivoId.set(null);
        this.cargarEmpleados();
      },
      error: () => {
        this.actualizandoActivoId.set(null);
        this.errorEmpleados.set('No se pudo actualizar el estado del empleado.');
      },
    });
  }

  // =====================================================================
  // HISTORIAL (con filtros) + captura manual / corrección de un registro
  // =====================================================================
  asistencias = signal<Asistencia[]>([]);
  cargandoHistorial = signal(true);
  errorHistorial = signal('');

  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroEmpleadoId = signal<number | null>(null);

  hayFiltrosHistorial = computed(
    () => !!this.filtroDesde() || !!this.filtroHasta() || !!this.filtroEmpleadoId(),
  );

  private consultaHistorial?: Subscription;

  cargarHistorial(): void {
    this.consultaHistorial?.unsubscribe();
    this.cargandoHistorial.set(true);
    this.errorHistorial.set('');

    const filtros: FiltrosAsistencias = {
      desde: this.filtroDesde(),
      hasta: this.filtroHasta(),
      empleado_id: this.filtroEmpleadoId(),
    };

    this.consultaHistorial = this.asistenciasService.listar(filtros).subscribe({
      next: (asistencias) => {
        this.asistencias.set(asistencias);
        this.cargandoHistorial.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorHistorial.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : error.error?.error || 'No se pudo cargar el historial.',
        );
        this.cargandoHistorial.set(false);
      },
    });
  }

  cambiarFiltroDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarHistorial();
  }

  cambiarFiltroHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarHistorial();
  }

  cambiarFiltroEmpleado(valor: string): void {
    this.filtroEmpleadoId.set(valor === '' ? null : +valor);
    this.cargarHistorial();
  }

  limpiarFiltrosHistorial(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroEmpleadoId.set(null);
    this.cargarHistorial();
  }

  // Un solo formulario sirve para la captura manual (crear, día pasado) y
  // para corregir un registro existente (editar) — mismo patrón que ya usa
  // usuarios.ts para alta/edición de cuentas.
  modoFormularioAsistencia = signal<ModoFormularioAsistencia>(null);
  asistenciaEditandoId = signal<number | null>(null);
  empleadoIdAsistenciaForm = signal<number | null>(null);
  fechaAsistenciaForm = signal('');
  horaEntradaForm = signal('');
  horaSalidaForm = signal('');
  observacionesForm = signal('');
  procesandoFormAsistencia = signal(false);
  errorFormularioAsistencia = signal('');

  abrirCapturaManual(): void {
    this.modoFormularioAsistencia.set('crear');
    this.asistenciaEditandoId.set(null);
    this.empleadoIdAsistenciaForm.set(this.empleadosActivos()[0]?.id ?? null);
    this.fechaAsistenciaForm.set('');
    this.horaEntradaForm.set('');
    this.horaSalidaForm.set('');
    this.observacionesForm.set('');
    this.errorFormularioAsistencia.set('');
  }

  abrirCorreccion(asistencia: Asistencia): void {
    this.modoFormularioAsistencia.set('editar');
    this.asistenciaEditandoId.set(asistencia.id);
    this.empleadoIdAsistenciaForm.set(asistencia.empleado_id);
    this.fechaAsistenciaForm.set(asistencia.fecha);
    // Las horas llegan como HH:MM:SS; el input type="time" espera HH:MM.
    this.horaEntradaForm.set(asistencia.hora_entrada?.slice(0, 5) ?? '');
    this.horaSalidaForm.set(asistencia.hora_salida?.slice(0, 5) ?? '');
    this.observacionesForm.set(asistencia.observaciones ?? '');
    this.errorFormularioAsistencia.set('');
  }

  cerrarFormularioAsistencia(): void {
    this.modoFormularioAsistencia.set(null);
  }

  puedeGuardarAsistencia(): boolean {
    if (this.procesandoFormAsistencia()) {
      return false;
    }
    if (this.modoFormularioAsistencia() === 'crear') {
      if (!this.empleadoIdAsistenciaForm() || !this.fechaAsistenciaForm()) {
        return false;
      }
    }
    // Si se capturan ambas horas, la salida debe ser posterior a la entrada
    // (comparación de texto "HH:MM" funciona igual que numérica).
    if (
      this.horaEntradaForm() &&
      this.horaSalidaForm() &&
      this.horaSalidaForm() <= this.horaEntradaForm()
    ) {
      return false;
    }
    return true;
  }

  guardarFormularioAsistencia(): void {
    if (!this.puedeGuardarAsistencia()) {
      return;
    }
    this.procesandoFormAsistencia.set(true);
    this.errorFormularioAsistencia.set('');

    if (this.modoFormularioAsistencia() === 'crear') {
      const datos: CapturaManualAsistencia = {
        empleado_id: this.empleadoIdAsistenciaForm()!,
        fecha: this.fechaAsistenciaForm(),
        ...(this.horaEntradaForm() ? { hora_entrada: this.horaEntradaForm() } : {}),
        ...(this.horaSalidaForm() ? { hora_salida: this.horaSalidaForm() } : {}),
        ...(this.observacionesForm().trim()
          ? { observaciones: this.observacionesForm().trim() }
          : {}),
      };
      this.asistenciasService.capturarManual(datos).subscribe({
        next: () => this.alGuardarAsistenciaConExito(),
        error: (error: HttpErrorResponse) => this.alFallarGuardadoAsistencia(error),
      });
      return;
    }

    const datos: CorreccionAsistencia = {
      fecha: this.fechaAsistenciaForm(),
      hora_entrada: this.horaEntradaForm() || null,
      hora_salida: this.horaSalidaForm() || null,
      observaciones: this.observacionesForm().trim() || null,
    };
    this.asistenciasService.corregir(this.asistenciaEditandoId()!, datos).subscribe({
      next: () => this.alGuardarAsistenciaConExito(),
      error: (error: HttpErrorResponse) => this.alFallarGuardadoAsistencia(error),
    });
  }

  private alGuardarAsistenciaConExito(): void {
    this.procesandoFormAsistencia.set(false);
    this.modoFormularioAsistencia.set(null);
    this.cargarHistorial();
    this.cargarHoy();
  }

  private alFallarGuardadoAsistencia(error: HttpErrorResponse): void {
    this.procesandoFormAsistencia.set(false);
    this.errorFormularioAsistencia.set(
      error.error?.error || 'Ocurrió un error al guardar la asistencia.',
    );
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
