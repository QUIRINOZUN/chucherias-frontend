// =============================================================================
// asistencias/asistencias.ts — CONTROL DE PERSONAL Y ASISTENCIAS (Sprint 3)
// =============================================================================
// Pantalla "Asistencias". Solo administrador y encargado (igual que
// usuarios/inventario/caja — es información de personal). Cuatro secciones,
// mostradas como PESTAÑAS (una visible a la vez, vía pestanaActiva) en vez
// de ir todas apiladas en un solo scroll largo:
//
//   1. HOY: una tarjeta por empleado activo con un botón grande para marcar
//      su entrada o su salida AHORA. El botón decide solo cuál mostrar según
//      si ese empleado ya tiene un registro abierto hoy (asistenciasHoy).
//   2. EMPLEADOS: alta, edición y activar/desactivar — mismo patrón de
//      formulario único crear/editar que ya usa usuarios/usuarios.ts.
//   3. HORARIOS: calendario SEMANAL recurrente (sin fecha propia, se repite
//      cada semana) — se elige un empleado y se marca qué días trabaja con
//      sus horas; "Guardar" reemplaza TODO su horario de una vez (ver
//      routes/horarios.js). Es informativo por ahora, no calcula retardos.
//   4. HISTORIAL: filtros de fecha/empleado + un formulario (el mismo que la
//      captura manual) para corregir un registro ya existente.
//
// Un empleado LIGADO a una cuenta (`empleados.usuario_id`) ya no necesita
// que nadie le marque nada aquí: iniciar/cerrar sesión registra su entrada/
// salida solo (ver routes/auth.js). Esta pantalla sigue sirviendo para: (a)
// ligar cada cuenta con su empleado (selector en el formulario de alta/
// edición de abajo), (b) el repartidor, que no tiene cuenta porque su
// horario varía — a ese el encargado lo registra aquí a mano, y (c)
// corregir cualquier registro (automático o manual) que haya quedado mal.
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
import { Usuario, UsuariosService } from '../core/usuarios';
import { DiaHorario, DiaSemana, HorariosService } from '../core/horarios';
import { ThemeService } from '../core/theme';

// Días que opera el negocio (martes a domingo, cerrado lunes — ver
// CLAUDE.md) en el orden en que se muestran en el calendario.
const DIAS_OPERATIVOS: { valor: DiaSemana; etiqueta: string }[] = [
  { valor: 'martes', etiqueta: 'Martes' },
  { valor: 'miercoles', etiqueta: 'Miércoles' },
  { valor: 'jueves', etiqueta: 'Jueves' },
  { valor: 'viernes', etiqueta: 'Viernes' },
  { valor: 'sabado', etiqueta: 'Sábado' },
  { valor: 'domingo', etiqueta: 'Domingo' },
];

// Estado de un día dentro del formulario de horario (no se manda tal cual al
// servidor — ver guardarHorario()).
interface DiaFormHorario {
  trabaja: boolean;
  horaEntrada: string;
  horaSalida: string;
}

type ModoFormularioEmpleado = 'crear' | 'editar' | null;
type ModoFormularioAsistencia = 'crear' | 'editar' | null;

// Las cuatro secciones ahora son pestañas (una visible a la vez) en vez de
// ir todas apiladas en un solo scroll largo — mismos datos, solo cambia la
// navegación.
type Pestana = 'hoy' | 'empleados' | 'horarios' | 'historial';

@Component({
  selector: 'app-asistencias',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './asistencias.html',
  styleUrl: './asistencias.css',
})
export class AsistenciasComponent implements OnInit {
  pestanaActiva = signal<Pestana>('hoy');

  cambiarPestana(pestana: Pestana): void {
    this.pestanaActiva.set(pestana);
  }

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

  // Para la tarjeta-resumen visual de "Hoy": cuántos activos están
  // adentro en este momento vs. cuántos aún no marcan nada.
  totalAdentroHoy = computed(() => this.abiertaPorEmpleado().size);
  totalPorLlegarHoy = computed(
    () =>
      this.empleadosActivos().filter(
        (e) => !this.abiertaPorEmpleado().has(e.id) && this.turnosCompletadosHoy(e.id) === 0,
      ).length,
  );

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
    private usuariosService: UsuariosService,
    private horariosService: HorariosService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarEmpleados();
    this.cargarHoy();
    this.cargarHistorial();
    this.cargarUsuariosDisponibles();
  }

  // Cuentas que se pueden ligar a un empleado en el formulario de alta/
  // edición (ver nota de asistencia automática al inicio del archivo). El
  // administrador queda fuera a propósito: no se le lleva asistencia.
  usuariosDisponibles = signal<Usuario[]>([]);

  cargarUsuariosDisponibles(): void {
    this.usuariosService.listar().subscribe({
      next: (usuarios) =>
        this.usuariosDisponibles.set(usuarios.filter((u) => u.rol !== 'administrador')),
      error: () => {
        // El selector simplemente queda vacío; el resto del formulario sigue
        // funcionando (usuario_id es opcional).
      },
    });
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
  // Cuenta ligada (asistencia automática) — null = ninguna (ej. repartidor).
  usuarioIdEmpleadoForm = signal<number | null>(null);
  procesandoFormEmpleado = signal(false);
  errorFormularioEmpleado = signal('');

  actualizandoActivoId = signal<number | null>(null);

  abrirCreacionEmpleado(): void {
    this.modoFormularioEmpleado.set('crear');
    this.empleadoEditandoId.set(null);
    this.nombreEmpleadoForm.set('');
    this.puestoEmpleadoForm.set('');
    this.fechaIngresoForm.set('');
    this.usuarioIdEmpleadoForm.set(null);
    this.errorFormularioEmpleado.set('');
  }

  abrirEdicionEmpleado(empleado: Empleado): void {
    this.modoFormularioEmpleado.set('editar');
    this.empleadoEditandoId.set(empleado.id);
    this.nombreEmpleadoForm.set(empleado.nombre);
    this.puestoEmpleadoForm.set(empleado.puesto);
    this.fechaIngresoForm.set(empleado.fecha_ingreso);
    this.usuarioIdEmpleadoForm.set(empleado.usuario_id);
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
      usuario_id: this.usuarioIdEmpleadoForm(),
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
  // HORARIOS (calendario semanal recurrente por empleado)
  // =====================================================================
  diasOperativos = DIAS_OPERATIVOS;

  empleadoIdHorario = signal<number | null>(null);
  // Un registro por día operativo; se inicializa vacío y se llena al elegir
  // un empleado (cargarHorario). record en vez de Map para que la plantilla
  // pueda leerlo directo con horarioForm()[dia.valor].
  horarioForm = signal<Record<DiaSemana, DiaFormHorario>>(this.horarioVacio());
  cargandoHorario = signal(false);
  guardandoHorario = signal(false);
  errorHorario = signal('');
  exitoHorario = signal('');

  private horarioVacio(): Record<DiaSemana, DiaFormHorario> {
    const vacio = {} as Record<DiaSemana, DiaFormHorario>;
    for (const dia of DIAS_OPERATIVOS) {
      vacio[dia.valor] = { trabaja: false, horaEntrada: '', horaSalida: '' };
    }
    return vacio;
  }

  seleccionarEmpleadoHorario(valor: string): void {
    const empleadoId = valor === '' ? null : +valor;
    this.empleadoIdHorario.set(empleadoId);
    this.exitoHorario.set('');
    this.errorHorario.set('');
    if (empleadoId) {
      this.cargarHorario(empleadoId);
    } else {
      this.horarioForm.set(this.horarioVacio());
    }
  }

  cargarHorario(empleadoId: number): void {
    this.cargandoHorario.set(true);
    this.horariosService.listar(empleadoId).subscribe({
      next: (horarios) => {
        const form = this.horarioVacio();
        for (const h of horarios) {
          // Un día fuera de DIAS_OPERATIVOS (ej. "lunes", que el negocio no
          // opera pero el modelo no lo prohíbe) simplemente no tiene casilla
          // en este calendario — se ignora aquí, no se pierde en el servidor.
          if (form[h.dia_semana]) {
            form[h.dia_semana] = {
              trabaja: true,
              horaEntrada: h.hora_entrada.slice(0, 5),
              horaSalida: h.hora_salida.slice(0, 5),
            };
          }
        }
        this.horarioForm.set(form);
        this.cargandoHorario.set(false);
      },
      error: () => {
        this.errorHorario.set('No se pudo cargar el horario de ese empleado.');
        this.cargandoHorario.set(false);
      },
    });
  }

  alternarDiaHorario(dia: DiaSemana): void {
    this.horarioForm.update((form) => ({
      ...form,
      [dia]: { ...form[dia], trabaja: !form[dia].trabaja },
    }));
  }

  actualizarHoraHorario(dia: DiaSemana, campo: 'horaEntrada' | 'horaSalida', valor: string): void {
    this.horarioForm.update((form) => ({
      ...form,
      [dia]: { ...form[dia], [campo]: valor },
    }));
  }

  puedeGuardarHorario(): boolean {
    if (this.guardandoHorario() || !this.empleadoIdHorario()) {
      return false;
    }
    const form = this.horarioForm();
    return this.diasOperativos.every((dia) => {
      const d = form[dia.valor];
      if (!d.trabaja) {
        return true;
      }
      return !!d.horaEntrada && !!d.horaSalida && d.horaSalida > d.horaEntrada;
    });
  }

  guardarHorario(): void {
    if (!this.puedeGuardarHorario()) {
      return;
    }
    const empleadoId = this.empleadoIdHorario()!;
    const form = this.horarioForm();
    const dias: DiaHorario[] = this.diasOperativos
      .filter((dia) => form[dia.valor].trabaja)
      .map((dia) => ({
        dia_semana: dia.valor,
        hora_entrada: form[dia.valor].horaEntrada,
        hora_salida: form[dia.valor].horaSalida,
      }));

    this.guardandoHorario.set(true);
    this.errorHorario.set('');
    this.exitoHorario.set('');
    this.horariosService.guardarSemana(empleadoId, dias).subscribe({
      next: () => {
        this.guardandoHorario.set(false);
        this.exitoHorario.set('Horario guardado.');
      },
      error: (error: HttpErrorResponse) => {
        this.guardandoHorario.set(false);
        this.errorHorario.set(error.error?.error || 'No se pudo guardar el horario.');
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
