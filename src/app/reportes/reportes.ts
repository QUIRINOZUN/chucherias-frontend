// =============================================================================
// reportes/reportes.ts — REPORTE CONSOLIDADO (RF-26, Sprint 4 oficial)
// =============================================================================
// Pantalla "Reportes". Solo administrador y encargado (información
// financiera y de personal, RNF-03 — mismo criterio que Ventas, Mermas y
// Caja). Un filtro de fecha opcional (desde/hasta, combinable);
// sin filtros se ve el resumen de TODO el histórico, mismo patrón que
// mermas.ts. Todo el cálculo vive en el servidor (routes/reportes.js) —
// esta pantalla solo pinta lo que ya le llega calculado.
//
// PESTAÑAS (2026-10-22, antes era una sola rejilla de 4 tarjetas apretadas
// una junto a otra): "General" es la de entrada — un dashboard condensado
// (una cifra principal + una tarjeta resumen por dominio, cada una
// navegable a su propia pestaña) — y "Ventas"/"Inventario"/"Personal"/
// "Clientes y lealtad" muestran el detalle completo de su dominio, con
// espacio de sobra en vez de competir por sitio en una rejilla de 2x2. Los
// filtros de fecha son compartidos (arriba, fuera de las pestañas): se
// aplican al resumen completo sin importar cuál esté activa.
//
// GRÁFICAS (2026-10-22, siguiendo el skill de dataviz del propio
// proyecto): sin librería nueva — SVG a mano, reutilizando los tokens de
// color que ya existen (--mod-ventas/inventario/asistencias/clientes,
// --exito-texto/--peligro-texto), el mismo criterio que ya usa toda la app
// para no mezclar dependencias nuevas con el estilo ya establecido.
//   - Ventas: una LÍNEA de tendencia (ventas por día, `serie_diaria`) — es
//     el único dato nuevo que pidió tocar el backend, porque una tendencia
//     necesita una serie, no un solo total. Un color (sequential), con un
//     punto por día y su detalle en un `<title>` nativo al pasar el mouse
//     — nunca la ÚNICA forma de leer el dato: la lista "Ver detalle por
//     día" (texto, siempre alcanzable con teclado) es la gemela accesible
//     de la gráfica, igual que ya pide el skill ("todo valor también
//     alcanzable sin pasar el mouse").
//   - Ventas/Personal: barras horizontales de comparación de magnitud
//     (Efectivo/Transferencia, Completadas/Canceladas,
//     Asistencias/Retardos) — 1-3 series, un color cada una, con su valor
//     SIEMPRE visible junto a la barra (nunca solo en un tooltip).
//     Completadas/Canceladas y Asistencias/Retardos usan el rojo/verde
//     funcional que YA significa éxito/alerta en toda la app (nunca un
//     color nuevo para "serie 2" — ver el anti-patrón de reusar un color
//     de estado para una serie cualquiera, o viceversa).
//   - Inventario: un MEDIDOR (insumos bajo mínimo / total) — una proporción
//     contra un límite es justo el caso que el skill marca para un medidor,
//     no para una gráfica de barras.
//   - Clientes: cada fila de "más cerca de su próximo descuento" gana una
//     barra fina (visitas del ciclo actual / 10) detrás del texto que ya
//     existía — el texto sigue siendo la fuente de verdad, la barra es un
//     refuerzo visual, nunca el único lugar donde vive el dato.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ReportesService, ResumenReportes } from '../core/reportes';
import { ThemeService } from '../core/theme';

// "AAAA-MM-DD" en hora LOCAL — nunca toISOString(), que corre la fecha un
// día con el offset negativo de México (mismo criterio que usa todo el
// backend y asistencias.ts).
function formatoFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// "AAAA-MM-DD" -> "DD/MM", sin pasar por `Date` (el mismo corrimiento de
// zona horaria que el resto del proyecto evita en todos lados).
function etiquetaFechaCorta(dia: string): string {
  const [, mes, diaNum] = dia.split('-');
  return `${diaNum}/${mes}`;
}

// Una fila de las barras horizontales de comparación (ver cabecera del
// archivo). `esMoneda` decide si la plantilla la formatea con el pipe de
// moneda o la muestra como un entero plano (conteos vs montos).
interface FilaBarra {
  etiqueta: string;
  valor: number;
  esMoneda: boolean;
  color: string;
  porcentaje: number;
}

// El ancho de cada barra es relativo al MAYOR valor del grupo (esa barra
// llega al 100%) — así se comparan entre sí, no contra un tope fijo.
function filasBarra(items: Omit<FilaBarra, 'porcentaje'>[]): FilaBarra[] {
  const maximo = Math.max(...items.map((i) => i.valor), 1);
  return items.map((i) => ({ ...i, porcentaje: Math.min(100, (i.valor / maximo) * 100) }));
}

// Un punto ya proyectado a coordenadas del viewBox (300×100) de la gráfica
// de tendencia — `monto` llega como número (ya convertido desde el texto
// que manda PostgreSQL).
interface PuntoSerieVentas {
  x: number;
  y: number;
  dia: string;
  ventas: number;
  monto: number;
}

interface GraficaSerieVentas {
  puntos: PuntoSerieVentas[];
  rutaLinea: string;
  rutaArea: string;
  // Coordenada Y del valor 0 — la línea de base (gridline), siempre a la
  // misma altura sin importar el máximo de la serie.
  baseY: number;
  ultimo: PuntoSerieVentas;
  pico: PuntoSerieVentas;
}

// viewBox fijo 300×100 (3:1), escalado por CSS con `aspect-ratio` en vez de
// `preserveAspectRatio="none"` — así los puntos (círculos) no se deforman
// en elipses al estirar la gráfica a distintos anchos de pantalla.
const ANCHO_VIEWBOX = 300;
const ALTO_VIEWBOX = 100;
// 10 unidades de margen arriba/abajo para que ni el pico ni el valor 0
// queden pegados al borde (o recortados por el radio de los puntos).
const MARGEN_VERTICAL = 10;

function valorAY(valor: number, maximo: number): number {
  const alto = ALTO_VIEWBOX - MARGEN_VERTICAL * 2;
  return ALTO_VIEWBOX - MARGEN_VERTICAL - (maximo > 0 ? (valor / maximo) * alto : 0);
}

// Arma la gráfica de tendencia a partir de la serie diaria del servidor.
// Con menos de 2 días no alcanza para una tendencia (un solo punto no es
// una línea) — se devuelve `null` y la plantilla muestra un mensaje en vez
// de una gráfica vacía o engañosa (ver choosing-a-form.md del skill:
// "A single current value -> stat tile", nunca un gráfico de un solo punto).
function armarSerieVentas(
  serie: { dia: string; ventas: number; monto: string }[],
): GraficaSerieVentas | null {
  if (serie.length < 2) {
    return null;
  }
  const montos = serie.map((d) => Number(d.monto));
  const maximo = Math.max(...montos, 1);
  const pasoX = ANCHO_VIEWBOX / (serie.length - 1);

  const puntos: PuntoSerieVentas[] = serie.map((d, i) => ({
    x: i * pasoX,
    y: valorAY(Number(d.monto), maximo),
    dia: d.dia,
    ventas: d.ventas,
    monto: Number(d.monto),
  }));

  const rutaLinea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const baseY = valorAY(0, maximo);
  const rutaArea = `${rutaLinea} L ${puntos[puntos.length - 1].x} ${baseY} L ${puntos[0].x} ${baseY} Z`;

  return {
    puntos,
    rutaLinea,
    rutaArea,
    baseY,
    ultimo: puntos[puntos.length - 1],
    pico: puntos.reduce((mayor, actual) => (actual.monto > mayor.monto ? actual : mayor)),
  };
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class ReportesComponent implements OnInit {
  resumen = signal<ResumenReportes | null>(null);
  cargando = signal(true);
  error = signal('');

  filtroDesde = signal('');
  filtroHasta = signal('');

  pestanaActiva = signal<
    'general' | 'ventas' | 'inventario' | 'personal' | 'clientes' | 'rentabilidad'
  >('general');

  cambiarPestana(
    pestana: 'general' | 'ventas' | 'inventario' | 'personal' | 'clientes' | 'rentabilidad',
  ): void {
    this.pestanaActiva.set(pestana);
  }

  hayFiltros = computed(() => !!this.filtroDesde() || !!this.filtroHasta());

  // ---- Gráficas (ver cabecera del archivo) ----------------------------------
  etiquetaFechaCorta = etiquetaFechaCorta;

  serieVentas = computed<GraficaSerieVentas | null>(() => {
    const serie = this.resumen()?.ventas.serie_diaria ?? [];
    return armarSerieVentas(serie);
  });

  // Gemela accesible de la gráfica de tendencia: la misma serie, en texto,
  // siempre alcanzable con teclado (ver cabecera del archivo).
  detalleSerieAbierto = signal(false);

  alternarDetalleSerie(): void {
    this.detalleSerieAbierto.update((v) => !v);
  }

  barrasPago = computed<FilaBarra[]>(() => {
    const v = this.resumen()?.ventas;
    if (!v) {
      return [];
    }
    return filasBarra([
      {
        etiqueta: 'Efectivo',
        valor: Number(v.monto_efectivo),
        esMoneda: true,
        color: 'var(--mod-ventas)',
      },
      {
        etiqueta: 'Transferencia',
        valor: Number(v.monto_transferencia),
        esMoneda: true,
        color: 'var(--mod-ventas)',
      },
    ]);
  });

  barrasEstadoVenta = computed<FilaBarra[]>(() => {
    const v = this.resumen()?.ventas;
    if (!v) {
      return [];
    }
    return filasBarra([
      {
        etiqueta: 'Completadas',
        valor: v.total_ventas,
        esMoneda: false,
        color: 'var(--exito-texto)',
      },
      {
        etiqueta: 'Canceladas',
        valor: v.canceladas,
        esMoneda: false,
        color: 'var(--peligro-texto)',
      },
    ]);
  });

  barrasPersonal = computed<FilaBarra[]>(() => {
    const p = this.resumen()?.personal;
    if (!p) {
      return [];
    }
    return filasBarra([
      {
        etiqueta: 'Asistencias registradas',
        valor: p.asistencias_registradas,
        esMoneda: false,
        color: 'var(--mod-asistencias)',
      },
      { etiqueta: 'Retardos', valor: p.retardos, esMoneda: false, color: 'var(--peligro-texto)' },
    ]);
  });

  // Medidor de insumos bajo su mínimo (una proporción contra un límite,
  // nunca una gráfica de barras para esto — ver choosing-a-form.md). El
  // relleno es rojo en cuanto hay AL MENOS uno bajo mínimo (mismo criterio
  // de alerta que ya usa toda la app, no un semáforo de severidad nuevo).
  medidorInventario = computed<{ porcentaje: number; color: string } | null>(() => {
    const inv = this.resumen()?.inventario;
    if (!inv || inv.total_insumos === 0) {
      return null;
    }
    return {
      porcentaje: Math.min(100, (inv.bajo_minimo / inv.total_insumos) * 100),
      color: inv.bajo_minimo > 0 ? 'var(--peligro-texto)' : 'var(--exito-texto)',
    };
  });

  // Ancho de la barra fina de cada cliente del "top 5" — ciclo de lealtad
  // de 0 a 10 visitas (ver routes/clientes.js), así que el tope siempre es
  // 10, no el mayor valor del grupo.
  anchoBarraCliente(visitas: number): number {
    return Math.min(100, (visitas / 10) * 100);
  }

  // Costeo y rentabilidad (2026-10-27): mismo patrón que medidorInventario
  // — una proporción contra un límite, nunca una gráfica de barras. Rojo
  // mientras falte CUALQUIER insumo por capturar (foto de ahora, no del
  // periodo): mide avance de captura, no es un error del sistema.
  // Ancho de la barra fina de cada producto del "top margen bajo" — un
  // margen % puede ser negativo (el costo supera el precio); la barra se
  // recorta a 0 en ese caso, el texto sigue mostrando el número real.
  anchoBarraMargen(margenPorcentaje: number): number {
    return Math.max(0, Math.min(100, margenPorcentaje));
  }

  medidorCostoCapturado = computed<{ porcentaje: number; color: string } | null>(() => {
    const rent = this.resumen()?.rentabilidad;
    if (!rent || rent.total_insumos === 0) {
      return null;
    }
    return {
      porcentaje: Math.min(100, (rent.insumos_sin_costo / rent.total_insumos) * 100),
      color: rent.insumos_sin_costo > 0 ? 'var(--peligro-texto)' : 'var(--exito-texto)',
    };
  });

  private consulta?: Subscription;

  constructor(
    private reportesService: ReportesService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarResumen();
  }

  cargarResumen(): void {
    // Si se cambia un filtro antes de que responda la consulta anterior, se
    // cancela: una respuesta vieja y lenta no debe pisar el resultado actual
    // (mismo criterio que ya usa mermas.ts/caja.ts con sus filtros de fecha).
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set('');

    this.consulta = this.reportesService
      .obtenerResumen({ desde: this.filtroDesde(), hasta: this.filtroHasta() })
      .subscribe({
        next: (resumen) => {
          this.resumen.set(resumen);
          this.cargando.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(
            error.status === 0
              ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
              : error.error?.error || 'No se pudo generar el reporte.',
          );
          this.cargando.set(false);
        },
      });
  }

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarResumen();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarResumen();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.cargarResumen();
  }

  // RF-26 ("por día, semana y mes"): accesos rápidos que llenan desde/hasta
  // sin tener que teclear el rango a mano.
  seleccionarHoy(): void {
    const hoy = formatoFechaLocal(new Date());
    this.filtroDesde.set(hoy);
    this.filtroHasta.set(hoy);
    this.cargarResumen();
  }

  seleccionarSemana(): void {
    const hoy = new Date();
    // Lunes de esta semana: getDay() da 0=domingo..6=sábado; se retrocede
    // al lunes más reciente (domingo retrocede 6 días, no 1).
    const diasDesdeElLunes = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeElLunes);
    this.filtroDesde.set(formatoFechaLocal(lunes));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarResumen();
  }

  seleccionarMes(): void {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.filtroDesde.set(formatoFechaLocal(primerDia));
    this.filtroHasta.set(formatoFechaLocal(hoy));
    this.cargarResumen();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
