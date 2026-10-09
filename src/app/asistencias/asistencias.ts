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
import {
  DatosExcepcion,
  DiaHorario,
  DiaSemana,
  ExcepcionHorario,
  Horario,
  HorariosService,
  TipoExcepcion,
} from '../core/horarios';
import { ThemeService } from '../core/theme';

// ---- Calendario (semana o mes, 2026-10-09) --------------------------------
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

// Cabecera de la cuadrícula del mes (domingo a sábado — aquí SÍ se incluye
// lunes porque es un calendario real, aunque el negocio no opere ese día).
const NOMBRES_DIA_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

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

// Nombre completo de cada día, para la etiqueta "Repetir todos los
// martes" del checkbox de horario recurrente (ver guardarComoRecurrente()).
const NOMBRE_DIA_SEMANA: Record<DiaSemana, string> = {
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miércoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sábado',
  domingo: 'domingo',
};

// "5 – 11 oct" — usado tanto por el calendario editable (semana) como por
// el resumen de horas trabajadas, para no formatear el rango dos veces.
function formatoRangoCorto(inicio: Date, fin: Date): string {
  const formato = (f: Date) => `${f.getDate()} ${NOMBRES_MES_CORTO[f.getMonth()]}`;
  return `${formato(inicio)} – ${formato(fin)}`;
}

// Una celda del calendario (cuadrícula domingo→sábado; en la vista "mes"
// incluye días de relleno del mes anterior/siguiente, en "semana" son
// siempre los 7 días visibles).
interface CeldaCalendario {
  fecha: Date;
  numero: number;
  enMesActual: boolean;
  esHoy: boolean;
  diaSemana: DiaSemana | null;
}

// Estado EFECTIVO de un día para el empleado elegido (ver estadoDelDia()).
interface EstadoDiaCalendario {
  tipo: TipoExcepcion;
  horaEntrada: string | null;
  horaSalida: string | null;
  // true si viene de una excepción guardada para esa fecha; false si es el
  // horario recurrente normal (o "descanso" por default).
  esExcepcion: boolean;
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
  // HORARIOS — CALENDARIO (semana o mes, a elección — estilo Google
  // Calendar, 2026-10-09)
  // =====================================================================
  // Una sola vista de calendario real para UN empleado a la vez, con un
  // selector Semana/Mes (vistaCalendario) igual que Google Calendar —
  // reemplaza las dos sub-vistas anteriores ("Editar", un formulario de
  // interruptores sin forma de calendario, y "Mes", que solo tenía vista
  // de mes). Tocar un día abre SIEMPRE la misma ventana, sin importar la
  // vista activa, para asignarle trabaja/descanso/cerrado a ESA fecha.
  //
  // Esa ventana ahora distingue, igual que Google Calendar al editar un
  // evento repetido ("solo este evento" vs. "todos los eventos"):
  //   - Guardar normal → excepción de ESA fecha (horario_excepciones),
  //     sin tocar las demás semanas.
  //   - "Repetir cada semana" marcado → actualiza el horario RECURRENTE
  //     de ese día de la semana (horarios) para todas las semanas, y
  //     quita la excepción de esa fecha si tenía una (ya no hace falta,
  //     el recurrente actualizado la cubre).
  NOMBRES_DIA_CORTO = NOMBRES_DIA_CORTO;
  NOMBRES_MES = NOMBRES_MES;

  // Sub-navegación DENTRO de la pestaña Horarios: el calendario editable
  // de un empleado (semana o mes), o el resumen de horas REALES
  // trabajadas por semana (todos los empleados juntos) — mismo criterio
  // de pestañas que el resto de la pantalla.
  subVistaHorario = signal<'calendario' | 'horas'>('calendario');

  cambiarSubVistaHorario(vista: 'calendario' | 'horas'): void {
    this.subVistaHorario.set(vista);
  }

  empleadoIdHorario = signal<number | null>(null);
  vistaCalendario = signal<'semana' | 'mes'>('mes');

  cambiarVistaCalendario(vista: 'semana' | 'mes'): void {
    this.vistaCalendario.set(vista);
    this.cargarExcepcionesCalendario();
  }

  seleccionarEmpleadoHorario(valor: string): void {
    const empleadoId = valor === '' ? null : +valor;
    this.empleadoIdHorario.set(empleadoId);
    this.cargarExcepcionesCalendario();
  }

  todosLosHorarios = signal<Horario[]>([]);
  mesVisible = signal(this.inicioDeMes(new Date()));
  semanaVisibleCalendario = signal(this.domingoDeLaSemana(new Date()));
  excepcionesCalendario = signal<ExcepcionHorario[]>([]);
  cargandoExcepciones = signal(false);

  private inicioDeMes(fecha: Date): { anio: number; mes: number } {
    return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
  }

  // Domingo de la semana que contiene `fecha` (mismo criterio que la
  // cuadrícula del mes: la semana siempre arranca en domingo).
  private domingoDeLaSemana(fecha: Date): Date {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  nombreMesVisible = computed(() => {
    const { anio, mes } = this.mesVisible();
    return `${NOMBRES_MES[mes]} ${anio}`;
  });

  // Título del período visible en la barra de navegación: el mes y año,
  // o el rango de la semana — según la vista activa.
  tituloPeriodoVisible = computed(() => {
    if (this.vistaCalendario() === 'mes') {
      return this.nombreMesVisible();
    }
    const inicio = this.semanaVisibleCalendario();
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return formatoRangoCorto(inicio, fin);
  });

  // Límites de la CUADRÍCULA completa del mes (incluye los días de
  // relleno del mes anterior/siguiente que completan la primera y la
  // última semana).
  private limitesCuadriculaMes = computed(() => {
    const { anio, mes } = this.mesVisible();
    const primerDiaMes = new Date(anio, mes, 1);
    const ultimoDiaMes = new Date(anio, mes + 1, 0);
    const inicio = new Date(primerDiaMes);
    inicio.setDate(inicio.getDate() - inicio.getDay());
    const fin = new Date(ultimoDiaMes);
    fin.setDate(fin.getDate() + (6 - fin.getDay()));
    return { inicio, fin };
  });

  // Rango real que hace falta pedirle al servidor (excepciones), según la
  // vista activa: la cuadrícula completa del mes, o los 7 días de la
  // semana visible.
  private rangoVisibleCalendario = computed(() => {
    if (this.vistaCalendario() === 'mes') {
      return this.limitesCuadriculaMes();
    }
    const inicio = this.semanaVisibleCalendario();
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return { inicio, fin };
  });

  // Celdas a dibujar: en "mes", semanas completas (domingo→sábado, con
  // relleno del mes anterior/siguiente); en "semana", una sola fila con
  // los 7 días del rango visible. El mismo arreglo de arreglos alimenta
  // la misma cuadrícula en la plantilla sin importar la vista.
  celdasCalendario = computed<CeldaCalendario[][]>(() => {
    const hoy = new Date();
    const construirCelda = (fecha: Date, mesDeReferencia: number): CeldaCalendario => ({
      fecha: new Date(fecha),
      numero: fecha.getDate(),
      enMesActual: this.vistaCalendario() === 'semana' || fecha.getMonth() === mesDeReferencia,
      esHoy:
        fecha.getFullYear() === hoy.getFullYear() &&
        fecha.getMonth() === hoy.getMonth() &&
        fecha.getDate() === hoy.getDate(),
      diaSemana: DIA_SEMANA_POR_INDICE[fecha.getDay()],
    });

    if (this.vistaCalendario() === 'semana') {
      const inicio = this.semanaVisibleCalendario();
      const fila: CeldaCalendario[] = [];
      const cursor = new Date(inicio);
      for (let i = 0; i < 7; i++) {
        fila.push(construirCelda(cursor, cursor.getMonth()));
        cursor.setDate(cursor.getDate() + 1);
      }
      return [fila];
    }

    const { mes } = this.mesVisible();
    const { inicio, fin } = this.limitesCuadriculaMes();
    const semanas: CeldaCalendario[][] = [];
    let semanaActual: CeldaCalendario[] = [];
    const cursor = new Date(inicio);
    while (cursor <= fin) {
      semanaActual.push(construirCelda(cursor, mes));
      if (semanaActual.length === 7) {
        semanas.push(semanaActual);
        semanaActual = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return semanas;
  });

  // Mapa `empleadoId-diaSemana` → su horario recurrente, para no recorrer
  // todosLosHorarios() por cada celda del calendario.
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

  private excepcionesPorFecha = computed(() => {
    const mapa = new Map<string, ExcepcionHorario>();
    for (const e of this.excepcionesCalendario()) {
      mapa.set(e.fecha, e);
    }
    return mapa;
  });

  // Estado EFECTIVO de un día para el empleado elegido: excepción si
  // existe, si no el horario recurrente, si tampoco hay nada "descanso".
  estadoDelDia(celda: CeldaCalendario): EstadoDiaCalendario {
    const empleadoId = this.empleadoIdHorario();
    const fechaStr = formatoFechaLocal(celda.fecha);
    const excepcion = empleadoId ? this.excepcionesPorFecha().get(fechaStr) : undefined;
    if (excepcion) {
      return {
        tipo: excepcion.tipo,
        horaEntrada: excepcion.hora_entrada,
        horaSalida: excepcion.hora_salida,
        esExcepcion: true,
      };
    }
    if (!celda.diaSemana) {
      return { tipo: 'cerrado', horaEntrada: null, horaSalida: null, esExcepcion: false };
    }
    const horario = empleadoId ? this.horarioDeEseDia(empleadoId, celda.diaSemana) : null;
    if (horario) {
      return {
        tipo: 'trabaja',
        horaEntrada: horario.hora_entrada,
        horaSalida: horario.hora_salida,
        esExcepcion: false,
      };
    }
    return { tipo: 'descanso', horaEntrada: null, horaSalida: null, esExcepcion: false };
  }

  // Retrocede/avanza un mes o una semana, según la vista activa — misma
  // barra de navegación para las dos.
  periodoAnterior(): void {
    if (this.vistaCalendario() === 'mes') {
      const { anio, mes } = this.mesVisible();
      this.mesVisible.set(this.inicioDeMes(new Date(anio, mes - 1, 1)));
    } else {
      const inicio = new Date(this.semanaVisibleCalendario());
      inicio.setDate(inicio.getDate() - 7);
      this.semanaVisibleCalendario.set(inicio);
    }
    this.cargarExcepcionesCalendario();
  }

  periodoSiguiente(): void {
    if (this.vistaCalendario() === 'mes') {
      const { anio, mes } = this.mesVisible();
      this.mesVisible.set(this.inicioDeMes(new Date(anio, mes + 1, 1)));
    } else {
      const inicio = new Date(this.semanaVisibleCalendario());
      inicio.setDate(inicio.getDate() + 7);
      this.semanaVisibleCalendario.set(inicio);
    }
    this.cargarExcepcionesCalendario();
  }

  private cargarTodosLosHorarios(): void {
    this.horariosService.listar().subscribe({
      next: (horarios) => this.todosLosHorarios.set(horarios),
      error: () => {
        // El calendario simplemente sale sin horario recurrente (todo se
        // vería como "descanso"); el resto de la pantalla sigue
        // funcionando.
      },
    });
  }

  cargarExcepcionesCalendario(): void {
    const empleadoId = this.empleadoIdHorario();
    if (!empleadoId) {
      this.excepcionesCalendario.set([]);
      return;
    }
    const { inicio, fin } = this.rangoVisibleCalendario();
    this.cargandoExcepciones.set(true);
    this.horariosService
      .listarExcepciones(empleadoId, formatoFechaLocal(inicio), formatoFechaLocal(fin))
      .subscribe({
        next: (excepciones) => {
          this.excepcionesCalendario.set(excepciones);
          this.cargandoExcepciones.set(false);
        },
        error: () => {
          this.cargandoExcepciones.set(false);
        },
      });
  }

  // ---- Ventana emergente: asignar el día (trabaja/descanso/cerrado) ----
  diaExcepcionEditando = signal<CeldaCalendario | null>(null);
  tipoExcepcionForm = signal<TipoExcepcion>('descanso');
  horaEntradaExcepcionForm = signal('');
  horaSalidaExcepcionForm = signal('');
  // "Repetir cada semana" (2026-10-09): en vez de una excepción de solo
  // esa fecha, actualiza el horario RECURRENTE de ese día de la semana —
  // ver guardarComoRecurrente().
  repetirSemanalmenteForm = signal(false);
  guardandoExcepcion = signal(false);
  errorExcepcion = signal('');

  // Etiqueta para el checkbox "Repetir todos los ___" — vacío si el día
  // que se edita no tiene un día de la semana real (no debería pasar: el
  // checkbox se oculta cuando el tipo es "cerrado", el único caso donde
  // esto importaría para un lunes).
  etiquetaDiaEditando = computed(() => {
    const celda = this.diaExcepcionEditando();
    return celda?.diaSemana ? NOMBRE_DIA_SEMANA[celda.diaSemana] : '';
  });

  abrirEdicionDia(celda: CeldaCalendario): void {
    if (!this.empleadoIdHorario()) {
      return;
    }
    const estado = this.estadoDelDia(celda);
    this.diaExcepcionEditando.set(celda);
    this.tipoExcepcionForm.set(estado.tipo);
    this.horaEntradaExcepcionForm.set(estado.horaEntrada?.slice(0, 5) ?? '');
    this.horaSalidaExcepcionForm.set(estado.horaSalida?.slice(0, 5) ?? '');
    this.repetirSemanalmenteForm.set(false);
    this.errorExcepcion.set('');
  }

  cerrarEdicionDia(): void {
    if (this.guardandoExcepcion()) {
      return;
    }
    this.diaExcepcionEditando.set(null);
  }

  // Si el día que se está editando tiene hoy una excepción propia (en vez
  // de estar usando el horario normal) — decide si se muestra el botón
  // "Quitar excepción".
  diaEditandoTieneExcepcion(): boolean {
    const celda = this.diaExcepcionEditando();
    return !!celda && this.estadoDelDia(celda).esExcepcion;
  }

  puedeGuardarExcepcion(): boolean {
    if (this.guardandoExcepcion()) {
      return false;
    }
    if (this.tipoExcepcionForm() === 'trabaja') {
      return (
        !!this.horaEntradaExcepcionForm() &&
        !!this.horaSalidaExcepcionForm() &&
        this.horaSalidaExcepcionForm() > this.horaEntradaExcepcionForm()
      );
    }
    return true;
  }

  guardarExcepcionDia(): void {
    const celda = this.diaExcepcionEditando();
    const empleadoId = this.empleadoIdHorario();
    if (!celda || !empleadoId || !this.puedeGuardarExcepcion()) {
      return;
    }
    this.guardandoExcepcion.set(true);
    this.errorExcepcion.set('');

    // "Repetir cada semana" — igual que elegir "todos los eventos" al
    // editar un evento repetido en Google Calendar: cambia el horario
    // recurrente en vez de solo esta fecha. No aplica a "cerrado" (el
    // checkbox se oculta en ese caso) — si por lo que sea llegara así, se
    // trata como una excepción normal.
    if (
      this.repetirSemanalmenteForm() &&
      celda.diaSemana &&
      this.tipoExcepcionForm() !== 'cerrado'
    ) {
      this.guardarComoRecurrente(empleadoId, celda);
      return;
    }

    const datos: DatosExcepcion = {
      tipo: this.tipoExcepcionForm(),
      ...(this.tipoExcepcionForm() === 'trabaja'
        ? {
            hora_entrada: this.horaEntradaExcepcionForm(),
            hora_salida: this.horaSalidaExcepcionForm(),
          }
        : {}),
    };

    this.horariosService
      .guardarExcepcion(empleadoId, formatoFechaLocal(celda.fecha), datos)
      .subscribe({
        next: () => {
          this.guardandoExcepcion.set(false);
          this.diaExcepcionEditando.set(null);
          this.cargarExcepcionesCalendario();
        },
        error: (error: HttpErrorResponse) => {
          this.guardandoExcepcion.set(false);
          this.errorExcepcion.set(error.error?.error || 'No se pudo guardar.');
        },
      });
  }

  // Actualiza el horario RECURRENTE (`horarios`) para el día de la semana
  // de `celda`, en vez de una excepción de una sola fecha. Como el PUT
  // reemplaza TODO el horario del empleado de una vez (ver
  // routes/horarios.js), se parte de lo que ya tenía (todosLosHorarios,
  // sin el día en cuestión) y se le agrega o se le quita ese día. Si esa
  // fecha ya tenía una excepción propia, se quita: el recurrente
  // actualizado ya la cubre, no hace falta que compitan.
  private guardarComoRecurrente(empleadoId: number, celda: CeldaCalendario): void {
    const diaSemana = celda.diaSemana!;
    const diasActuales: DiaHorario[] = this.todosLosHorarios()
      .filter((h) => h.empleado_id === empleadoId && h.dia_semana !== diaSemana)
      .map((h) => ({
        dia_semana: h.dia_semana,
        hora_entrada: h.hora_entrada.slice(0, 5),
        hora_salida: h.hora_salida.slice(0, 5),
      }));

    if (this.tipoExcepcionForm() === 'trabaja') {
      diasActuales.push({
        dia_semana: diaSemana,
        hora_entrada: this.horaEntradaExcepcionForm(),
        hora_salida: this.horaSalidaExcepcionForm(),
      });
    }
    // "descanso": simplemente no se vuelve a agregar — ese día de la
    // semana queda sin fila en `horarios`, que es "descanso" por default.

    const teniaExcepcion = this.diaEditandoTieneExcepcion();
    this.horariosService.guardarSemana(empleadoId, diasActuales).subscribe({
      next: () => {
        this.cargarTodosLosHorarios();
        if (teniaExcepcion) {
          this.horariosService
            .quitarExcepcion(empleadoId, formatoFechaLocal(celda.fecha))
            .subscribe({
              next: () => this.finalizarGuardadoRecurrente(),
              error: () => this.finalizarGuardadoRecurrente(),
            });
        } else {
          this.finalizarGuardadoRecurrente();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.guardandoExcepcion.set(false);
        this.errorExcepcion.set(error.error?.error || 'No se pudo guardar el horario recurrente.');
      },
    });
  }

  private finalizarGuardadoRecurrente(): void {
    this.guardandoExcepcion.set(false);
    this.diaExcepcionEditando.set(null);
    this.cargarExcepcionesCalendario();
  }

  // Quita la excepción del día: vuelve a usar el horario normal (recurrente
  // o "descanso" si tampoco hay fila ahí).
  quitarExcepcionDia(): void {
    const celda = this.diaExcepcionEditando();
    const empleadoId = this.empleadoIdHorario();
    if (!celda || !empleadoId) {
      return;
    }
    this.guardandoExcepcion.set(true);
    this.errorExcepcion.set('');
    this.horariosService.quitarExcepcion(empleadoId, formatoFechaLocal(celda.fecha)).subscribe({
      next: () => {
        this.guardandoExcepcion.set(false);
        this.diaExcepcionEditando.set(null);
        this.cargarExcepcionesCalendario();
      },
      error: (error: HttpErrorResponse) => {
        this.guardandoExcepcion.set(false);
        this.errorExcepcion.set(error.error?.error || 'No se pudo quitar la excepción.');
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
    return formatoRangoCorto(inicio, fin);
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
