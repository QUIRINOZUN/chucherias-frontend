// =============================================================================
// nomina/nomina.ts — NÓMINA POR HORAS TRABAJADAS (pago del personal)
// =============================================================================
// Pantalla "Nómina". Solo administrador y encargado (información financiera
// y de personal, RNF-03 — mismo criterio que Reportes/Caja/Asistencias). Un
// filtro de fecha opcional (desde/hasta, combinable, con los mismos accesos
// rápidos Hoy/Esta semana/Este mes que ya usa Reportes); sin filtros se ve
// TODO el histórico. El cálculo de horas y de pago vive siempre en el
// servidor (routes/nomina.js) — esta pantalla solo pinta lo que ya le llega
// calculado y deja capturar/corregir la tarifa por hora de cada empleado.
//
// La tarifa (empleados.pago_por_hora) se captura aquí, no desde Asistencias
// → Empleados: es información salarial, más sensible que nombre/puesto, y
// el titular la revisa justo mientras calcula a quién le toca pagar.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { NominaService, ResumenNomina, EmpleadoNomina } from '../core/nomina';
import { ThemeService } from '../core/theme';

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que usa todo el
// backend y reportes.ts/asistencias.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

@Component({
  selector: 'app-nomina',
  standalone: true,
  imports: [CurrencyPipe, FocoDialogoDirective],
  templateUrl: './nomina.html',
  styleUrl: './nomina.css',
})
export class NominaComponent implements OnInit {
  resumen = signal<ResumenNomina | null>(null);
  cargando = signal(true);
  error = signal('');

  filtroDesde = signal('');
  filtroHasta = signal('');
  // Por default solo empleados activos; incluir desactivados sirve para
  // pagar un periodo en el que alguien todavía trabajaba.
  incluirInactivos = signal(false);

  hayFiltros = computed(() => !!this.filtroDesde() || !!this.filtroHasta());

  // ---- Totales del periodo (sumas simples sobre lo que ya calculó el
  // servidor — nunca se recalcula ningún pago en el cliente). ----
  // Number(...) es necesario: `horas_trabajadas`/`total_a_pagar` vienen de
  // columnas NUMERIC en Postgres, que el driver `pg` siempre entrega como
  // STRING (nunca number) para no perder precisión — el tipo `number` en
  // `EmpleadoNomina` describe la forma que debería tener, no lo que de
  // verdad llega en tiempo de ejecución. Sin la conversión, `+` concatena
  // strings en vez de sumar ("2.60" + "24.90" = "2.6024.90"), y
  // `Math.round(... * 100)` sobre eso da `NaN` — confirmado en vivo, el
  // total de horas se veía como "NaN horas trabajadas en total" con 2+
  // empleados reales.
  totalHoras = computed(
    () =>
      Math.round(
        (this.resumen()?.empleados ?? []).reduce(
          (suma, e) => suma + Number(e.horas_trabajadas),
          0,
        ) * 100,
      ) / 100,
  );
  totalAPagar = computed(() =>
    (this.resumen()?.empleados ?? []).reduce((suma, e) => suma + Number(e.total_a_pagar ?? 0), 0),
  );
  empleadosSinTarifa = computed(
    () => (this.resumen()?.empleados ?? []).filter((e) => e.pago_por_hora === null).length,
  );
  turnosSinCerrarTotal = computed(() =>
    (this.resumen()?.empleados ?? []).reduce((suma, e) => suma + e.turnos_sin_cerrar, 0),
  );

  // ---- Ventana de capturar/corregir tarifa ----
  empleadoEditando = signal<EmpleadoNomina | null>(null);
  tarifaForm = signal('');
  errorTarifa = signal('');
  guardandoTarifa = signal(false);

  // Vacío (quitar tarifa) o un número mayor a cero — nunca 0 ni negativo
  // (mismo criterio que ya valida el servidor).
  puedeGuardarTarifa = computed(() => {
    const texto = this.tarifaForm().trim();
    if (texto === '') return true;
    const valor = Number(texto);
    return Number.isFinite(valor) && valor > 0;
  });

  private consulta?: Subscription;

  constructor(
    private nominaService: NominaService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarNomina();
  }

  cargarNomina(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja y lenta no debe pisar el resultado actual
    // (mismo criterio que ya usa reportes.ts/mermas.ts/caja.ts).
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');

    this.consulta = this.nominaService
      .calcular({
        desde: this.filtroDesde(),
        hasta: this.filtroHasta(),
        todos: this.incluirInactivos(),
      })
      .subscribe({
        next: (resumen) => {
          this.resumen.set(resumen);
          this.cargando.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
              : error.error?.error || 'No se pudo calcular la nómina.',
          );
          this.cargando.set(false);
        },
      });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarNomina();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarNomina();
  }

  alternarIncluirInactivos(valor: boolean): void {
    this.incluirInactivos.set(valor);
    this.cargarNomina();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.cargarNomina();
  }

  // Mismos accesos rápidos que ya tiene Reportes — el titular paga por
  // semana o por quincena/mes, no capturando un rango a mano cada vez.
  seleccionarHoy(): void {
    const hoy = formatoFechaLocal(new Date());
    this.filtroDesde.set(hoy);
    this.filtroHasta.set(hoy);
    this.cargarNomina();
  }

  seleccionarSemana(): void {
    const hoy = new Date();
    const diasDesdeElLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeElLunes);
    this.filtroDesde.set(formatoFechaLocal(lunes));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarNomina();
  }

  seleccionarMes(): void {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.filtroDesde.set(formatoFechaLocal(primerDia));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarNomina();
  }

  // ---- Capturar/corregir tarifa ----
  abrirEdicionTarifa(empleado: EmpleadoNomina): void {
    this.empleadoEditando.set(empleado);
    this.tarifaForm.set(empleado.pago_por_hora !== null ? String(empleado.pago_por_hora) : '');
    this.errorTarifa.set('');
  }

  cerrarEdicionTarifa(): void {
    if (this.guardandoTarifa()) return;
    this.empleadoEditando.set(null);
  }

  guardarTarifa(): void {
    const empleado = this.empleadoEditando();
    if (!empleado || !this.puedeGuardarTarifa()) return;

    const texto = this.tarifaForm().trim();
    const nuevaTarifa = texto === '' ? null : Number(texto);

    this.guardandoTarifa.set(true);
    this.errorTarifa.set('');

    this.nominaService.actualizarTarifa(empleado.empleado_id, nuevaTarifa).subscribe({
      next: () => {
        this.guardandoTarifa.set(false);
        this.empleadoEditando.set(null);
        // Se vuelve a pedir el resumen completo en vez de recalcular el pago
        // en el cliente: el total a pagar siempre debe salir de la misma
        // multiplicación que hace el servidor.
        this.cargarNomina();
      },
      error: (error: HttpErrorResponse) => {
        this.guardandoTarifa.set(false);
        this.errorTarifa.set(error.error?.error || 'No se pudo guardar la tarifa.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
