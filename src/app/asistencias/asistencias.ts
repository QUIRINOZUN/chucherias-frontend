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
//   3. HORARIOS: tres sub-vistas (2026-10-08) —
//      (a) Editar: horario SEMANAL recurrente de UN empleado (sin fecha
//          propia, se repite cada semana); "Guardar" reemplaza TODO su
//          horario de una vez (ver routes/horarios.js).
//      (b) Mes: calendario del mes con TODOS los empleados activos a la
//          vez — quién trabaja cada día, armado en el cliente cruzando el
//          día de la semana de cada fecha contra el horario de cada
//          empleado (no hace falta un endpoint nuevo).
//      (c) Horas: resumen de horas trabajadas REALES por semana (de
//          `asistencias`, no de lo planeado), también todos los empleados
//          juntos. Sigue sin calcular retardos (horario vs. hora real de
//          entrada) — eso queda pendiente, ver CLAUDE.md.
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
import { DatePipe, DecimalPipe } from '@angular/common';
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
import { DiaHorario, DiaSemana, Horario, HorariosService } from '../core/horarios';
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

// ---- Calendario del mes (2026-10-08) --------------------------------------
// Índice de JS Date.getDay() (0 = domingo … 6 = sábado) al día de la semana
// del modelo; null en el índice 1 (lunes) porque el negocio no opera ese
// día — el calendario del mes lo muestra como "Cerrado", nunca como
// "Descanso" (son cosas distintas: cerrado es de TODO el negocio, descanso
// es de un empleado en particular un día que sí se opera).
const DIA_SEMANA_POR_INDICE: (DiaSemana | null)[] = [
  'domingo',
  null,
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
];

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const NOMBRES_MES_CORTO = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

// Una columna del calendario del mes.
interface DiaCalendarioMes {
  numero: number;
  diaSemana: DiaSemana | null;
  esHoy: boolean;
}

// ---- Horas trabajadas por semana (2026-10-08) ------------------------------
// Total de un empleado en la semana visible, calculado sobre asistencias
// REALES (no sobre lo planeado en `horarios`).
interface ResumenHorasEmpleado {
  empleado_id: number;
  nombre: string;
  horas: number;
  turnos: number;
  // Turnos con hora_entrada pero sin hora_salida todavía (no se suman a
  // `horas`, pero importa que no se pierdan de vista: alguien olvidó
  // cerrar, o sigue trabajando ahora mismo).
  turnosAbiertos: number;
}

// Diferencia en horas entre dos horas "HH:MM" o "HH:MM:SS" del MISMO día
// (el negocio no tiene turnos que crucen la medianoche).
function horasEntreHoras(horaInicio: string, horaFin: string): number {
  const minutos = (h: string) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  return (minutos(horaFin) - minutos(horaInicio)) / 60;
}

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que ya usa todo el
// backend, ver utils/fecha.js).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
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
  imports: [DatePipe, DecimalPipe],
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
    this.cargarTodosLosHorarios();
    this.cargarHorasSemana();
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

  // Sub-navegación DENTRO de la pestaña Horarios (2026-10-08): editar el
  // horario de un empleado (lo que ya existía), ver el calendario del mes
  // con todos los empleados juntos, o el resumen de horas trabajadas por
  // semana — mismo criterio de pestañas que el resto de la pantalla, para
  // no apilar las tres vistas en un solo scroll.
  subVistaHorario = signal<'editar' | 'mes' | 'horas'>('editar');

  cambiarSubVistaHorario(vista: 'editar' | 'mes' | 'horas'): void {
    this.subVistaHorario.set(vista);
  }

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
  // HORARIOS — CALENDARIO DEL MES (todos los empleados, 2026-10-08)
  // =====================================================================
  // A diferencia del editor de arriba (un empleado a la vez), aquí se ve
  // quién trabaja cada día del mes, para TODOS los empleados activos al
  // mismo tiempo — útil para planear turnos de un vistazo. Se arma
  // enteramente en el cliente a partir de `horarios` (recurrente, sin
  // fecha propia): para cada día del mes se calcula su día de la semana y
  // se cruza contra el horario de cada empleado — no hace falta ningún
  // endpoint nuevo, GET /api/horarios sin empleado_id ya trae todo.
  todosLosHorarios = signal<Horario[]>([]);
  mesVisible = signal(this.inicioDeMes(new Date()));

  private inicioDeMes(fecha: Date): { anio: number; mes: number } {
    return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
  }

  nombreMesVisible = computed(() => {
    const { anio, mes } = this.mesVisible();
    return `${NOMBRES_MES[mes]} ${anio}`;
  });

  diasDelMesVisible = computed<DiaCalendarioMes[]>(() => {
    const { anio, mes } = this.mesVisible();
    const totalDias = new Date(anio, mes + 1, 0).getDate();
    const hoy = new Date();
    const dias: DiaCalendarioMes[] = [];
    for (let numero = 1; numero <= totalDias; numero++) {
      const fecha = new Date(anio, mes, numero);
      dias.push({
        numero,
        diaSemana: DIA_SEMANA_POR_INDICE[fecha.getDay()],
        esHoy:
          fecha.getFullYear() === hoy.getFullYear() &&
          fecha.getMonth() === hoy.getMonth() &&
          fecha.getDate() === hoy.getDate(),
      });
    }
    return dias;
  });

  // Mapa `empleadoId-diaSemana` → su horario, para no recorrer
  // todosLosHorarios() una vez por cada celda de la tabla (empleados × días
  // del mes puede ser varios cientos de celdas).
  private horariosPorEmpleadoYDia = computed(() => {
    const mapa = new Map<string, Horario>();
    for (const h of this.todosLosHorarios()) {
      mapa.set(`${h.empleado_id}-${h.dia_semana}`, h);
    }
    return mapa;
  });

  horarioDeEseDia(empleadoId: number, diaSemana: DiaSemana | null): Horario | null {
    if (!diaSemana) {
      return null;
    }
    return this.horariosPorEmpleadoYDia().get(`${empleadoId}-${diaSemana}`) ?? null;
  }

  mesAnterior(): void {
    const { anio, mes } = this.mesVisible();
    this.mesVisible.set(this.inicioDeMes(new Date(anio, mes - 1, 1)));
  }

  mesSiguiente(): void {
    const { anio, mes } = this.mesVisible();
    this.mesVisible.set(this.inicioDeMes(new Date(anio, mes + 1, 1)));
  }

  private cargarTodosLosHorarios(): void {
    this.horariosService.listar().subscribe({
      next: (horarios) => this.todosLosHorarios.set(horarios),
      error: () => {
        // El calendario del mes simplemente sale vacío; el resto de la
        // pantalla sigue funcionando.
      },
    });
  }

  // =====================================================================
  // HORARIOS — HORAS TRABAJADAS POR SEMANA (todos los empleados, real,
  // 2026-10-08)
  // =====================================================================
  // A diferencia del calendario (lo PLANEADO), esto suma asistencias REALES
  // de la semana visible (hora_entrada/hora_salida ya registradas). Un
  // turno sin hora_salida todavía no se suma a las horas — se cuenta aparte
  // como "sin cerrar" para que no se pierda de vista (alguien olvidó cerrar
  // sesión, o sigue trabajando en este momento).
  semanaVisibleInicio = signal(this.lunesDeLaSemana(new Date()));
  asistenciasSemana = signal<Asistencia[]>([]);
  cargandoHorasSemana = signal(false);

  private lunesDeLaSemana(fecha: Date): Date {
    const d = new Date(fecha);
    const dia = d.getDay(); // 0 = domingo … 6 = sábado
    const diferencia = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diferencia);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  rangoSemanaVisible = computed(() => {
    const inicio = this.semanaVisibleInicio();
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return { inicio, fin };
  });

  textoRangoSemanaVisible = computed(() => {
    const { inicio, fin } = this.rangoSemanaVisible();
    const formato = (f: Date) => `${f.getDate()} ${NOMBRES_MES_CORTO[f.getMonth()]}`;
    return `${formato(inicio)} – ${formato(fin)}`;
  });

  resumenHorasSemana = computed<ResumenHorasEmpleado[]>(() => {
    const mapa = new Map<number, ResumenHorasEmpleado>();
    for (const a of this.asistenciasSemana()) {
      if (!mapa.has(a.empleado_id)) {
        mapa.set(a.empleado_id, {
          empleado_id: a.empleado_id,
          nombre: a.empleado_nombre,
          horas: 0,
          turnos: 0,
          turnosAbiertos: 0,
        });
      }
      const resumen = mapa.get(a.empleado_id)!;
      if (a.hora_entrada && a.hora_salida) {
        resumen.horas += horasEntreHoras(a.hora_entrada, a.hora_salida);
        resumen.turnos += 1;
      } else if (a.hora_entrada && !a.hora_salida) {
        resumen.turnosAbiertos += 1;
      }
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  totalHorasSemana = computed(() =>
    this.resumenHorasSemana().reduce((total, r) => total + r.horas, 0),
  );

  semanaAnterior(): void {
    const inicio = new Date(this.semanaVisibleInicio());
    inicio.setDate(inicio.getDate() - 7);
    this.semanaVisibleInicio.set(inicio);
    this.cargarHorasSemana();
  }

  semanaSiguiente(): void {
    const inicio = new Date(this.semanaVisibleInicio());
    inicio.setDate(inicio.getDate() + 7);
    this.semanaVisibleInicio.set(inicio);
    this.cargarHorasSemana();
  }

  cargarHorasSemana(): void {
    this.cargandoHorasSemana.set(true);
    const { inicio, fin } = this.rangoSemanaVisible();
    this.asistenciasService
      .listar({ desde: formatoFechaLocal(inicio), hasta: formatoFechaLocal(fin) })
      .subscribe({
        next: (asistencias) => {
          this.asistenciasSemana.set(asistencias);
          this.cargandoHorasSemana.set(false);
        },
        error: () => {
          this.cargandoHorasSemana.set(false);
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
