// =============================================================================
// core/reportes.ts — SERVICIO DE REPORTES (RF-26, Sprint 4 oficial)
// =============================================================================
// Habla con /api/reportes/resumen: un solo resumen que junta ventas,
// inventario, personal y clientes/lealtad. El servidor es quien calcula
// todo (ver routes/reportes.js) — este archivo solo define los tipos y la
// llamada HTTP, sin sumar ni combinar nada por su cuenta.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Un día del rango filtrado, para la gráfica de tendencia de la pestaña
// Ventas (2026-10-22) — acotada por el servidor a los últimos 30 días que
// caigan dentro del filtro, para que la consulta nunca crezca sin límite
// (ver routes/reportes.js).
export interface SerieDiaVenta {
  dia: string;
  ventas: number;
  monto: string;
}

export interface ResumenVentas {
  total_ventas: number;
  monto_total: string;
  monto_efectivo: string;
  monto_transferencia: string;
  canceladas: number;
  descuento_lealtad_total: string;
  serie_diaria: SerieDiaVenta[];
}

// `bajo_minimo`/`total_insumos` son una foto de AHORA (no del periodo
// filtrado) — el inventario de hace un mes no tiene sentido para decidir
// qué surtir hoy. `mermas_total`/`mermas_valor_total` sí se acotan al
// periodo (ver FiltrosReporte).
export interface ResumenInventario {
  total_insumos: number;
  bajo_minimo: number;
  mermas_total: number;
  mermas_valor_total: string;
}

// `empleados_activos` es una foto de AHORA; `asistencias_registradas` y
// `retardos` sí se acotan al periodo.
export interface ResumenPersonal {
  empleados_activos: number;
  asistencias_registradas: number;
  retardos: number;
}

export interface ClienteTop {
  id: number;
  nombre_completo: string;
  telefono: string | null;
  visitas_acumuladas: number;
}

// `total_clientes`/`top_clientes` son del ciclo de lealtad ACTUAL de cada
// cliente (no de cuántas visitas tuvo en el periodo) — solo
// `nuevos_en_periodo` se acota a las fechas filtradas.
export interface ResumenClientes {
  total_clientes: number;
  nuevos_en_periodo: number;
  top_clientes: ClienteTop[];
}

// Una variante del catálogo actual con el margen % más bajo (2026-10-27) —
// "foto de ahora" (precio y costo de hoy), no del periodo filtrado.
export interface ProductoMargenBajo {
  variante_id: number;
  variante_nombre: string;
  producto_nombre: string;
  precio: number;
  costo: number;
  margen_porcentaje: number;
}

// Costeo y rentabilidad (2026-10-27). `ingresos`/`costo_ventas`/
// `utilidad_bruta`/`margen_porcentaje`/`lineas_con_costo`/
// `lineas_sin_costo` SÍ se acotan al periodo filtrado (costo REAL de lo
// que se vendió, no el teórico del catálogo). `insumos_sin_costo`/
// `total_insumos`/`top_margen_bajo` son una foto de AHORA (el catálogo
// actual), igual criterio que `ResumenInventario.bajo_minimo`.
export interface ResumenRentabilidad {
  ingresos: number;
  costo_ventas: number;
  utilidad_bruta: number;
  margen_porcentaje: number | null;
  lineas_con_costo: number;
  lineas_sin_costo: number;
  insumos_sin_costo: number;
  total_insumos: number;
  top_margen_bajo: ProductoMargenBajo[];
}

export interface ResumenReportes {
  periodo: { desde: string | null; hasta: string | null };
  ventas: ResumenVentas;
  inventario: ResumenInventario;
  personal: ResumenPersonal;
  clientes: ResumenClientes;
  rentabilidad: ResumenRentabilidad;
}

export interface FiltrosReporte {
  desde?: string;
  hasta?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/reportes/resumen?desde=&hasta= — ambos opcionales (sin
  // ninguno, el resumen de ventas/mermas/asistencias es de TODO el
  // histórico, mismo criterio que ya usa MermasService.listar()).
  obtenerResumen(filtros: FiltrosReporte): Observable<ResumenReportes> {
    const params: Record<string, string> = {};
    if (filtros.desde) {
      params['desde'] = filtros.desde;
    }
    if (filtros.hasta) {
      params['hasta'] = filtros.hasta;
    }
    return this.http.get<ResumenReportes>(`${this.apiUrl}/reportes/resumen`, { params });
  }
}
