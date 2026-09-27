// =============================================================================
// comandas/comandas.ts — TABLERO DE COMANDAS DE COCINA (Sprint 2)
// =============================================================================
// Muestra las órdenes en proceso en tres columnas, una por estado:
//   Sin preparar → Preparando → Por entregar
// (cuando se marca "entregado" la orden sale del tablero).
//
// QUIÉN PUEDE QUÉ
//   Todos los roles que entran aquí VEN el tablero. Solo administrador,
//   encargado y auxiliar (cocina) ven el botón que avanza una comanda; el
//   cajero queda en modo consulta. El servidor aplica la misma regla, así que
//   ocultar el botón es comodidad, no la seguridad.
//
// ACTUALIZACIÓN: el tablero se vuelve a consultar solo cada 15 segundos
// (sondeo periódico) para que aparezcan las ventas nuevas sin recargar.
//
// DETALLES ÚTILES PARA LA COCINA
//   - Cada tarjeta indica si es presencial o a domicilio y resalta las notas
//     de personalización ("Sin: cebolla").
//   - Una comanda con 15 minutos o más esperando se marca en rojo.
// =============================================================================
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { EstadoOrden, Orden, OrdenesService } from '../core/ordenes';
import { ThemeService } from '../core/theme';

// Cada cuántos milisegundos se vuelve a pedir el tablero al servidor (15 s).
const INTERVALO_ACTUALIZACION_MS = 15000;

// Una comanda con más de este tiempo esperando se resalta en el tablero.
const MINUTOS_PARA_RESALTAR = 15;

// Quién puede avanzar una comanda: el mismo criterio que aplica el servidor
// en PATCH /api/ordenes/:id/estado (el cajero solo consulta).
const ROLES_QUE_AVANZAN = ['administrador', 'encargado', 'auxiliar'];

// A qué estado pasa una comanda al tocar su botón. 'entregado' no aparece como
// clave porque una orden entregada ya no se muestra ni se puede avanzar.
const SIGUIENTE_ESTADO: Partial<Record<EstadoOrden, EstadoOrden>> = {
  sin_preparar: 'preparando',
  preparando: 'por_entregar',
  por_entregar: 'entregado',
};

// Texto del botón de avance según el estado actual de la comanda.
const ETIQUETA_ACCION: Partial<Record<EstadoOrden, string>> = {
  sin_preparar: 'Empezar a preparar',
  preparando: 'Marcar por entregar',
  por_entregar: 'Marcar entregado',
};

// Descripción de una columna del tablero.
interface ColumnaTablero {
  estado: EstadoOrden;
  titulo: string;
  icono: string;
  vacio: string;
}

// Las tres columnas, de izquierda a derecha en el orden del flujo. La plantilla
// las recorre con un solo @for, así agregar un estado nuevo es agregar una línea.
const COLUMNAS: ColumnaTablero[] = [
  { estado: 'sin_preparar', titulo: 'Sin preparar', icono: 'reloj', vacio: 'Sin órdenes pendientes.' },
  { estado: 'preparando', titulo: 'Preparando', icono: 'cocinar', vacio: 'Sin órdenes en preparación.' },
  { estado: 'por_entregar', titulo: 'Por entregar', icono: 'paquete', vacio: 'Sin órdenes listas.' },
];

@Component({
  selector: 'app-comandas',
  standalone: true,
  templateUrl: './comandas.html',
  styleUrl: './comandas.css',
})
export class ComandasComponent implements OnInit, OnDestroy {
  // Órdenes activas tal como las devolvió el servidor.
  ordenes = signal<Orden[]>([]);
  cargando = signal(true);
  error = signal('');
  // id de la orden cuyo botón está esperando respuesta (evita doble toque).
  actualizandoOrdenId = signal<number | null>(null);

  columnas = COLUMNAS;
  etiquetaAccion = ETIQUETA_ACCION;

  // true si el rol del usuario puede avanzar comandas; controla si se muestran
  // los botones y el aviso de "modo consulta".
  puedeAvanzar = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return !!rol && ROLES_QUE_AVANZAN.includes(rol);
  });

  // Órdenes agrupadas por columna del tablero.
  ordenesPorEstado = computed(() => {
    const grupos: Partial<Record<EstadoOrden, Orden[]>> = {};
    for (const orden of this.ordenes()) {
      (grupos[orden.estado] ??= []).push(orden);
    }
    return grupos;
  });

  // Referencia al temporizador del sondeo, para poder detenerlo al salir.
  private intervaloId?: ReturnType<typeof setInterval>;

  constructor(
    private ordenesService: OrdenesService,
    private authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  // Al abrir el tablero: primera carga inmediata y luego una cada 15 segundos.
  ngOnInit(): void {
    this.cargarOrdenes();
    this.intervaloId = setInterval(() => this.cargarOrdenes(), INTERVALO_ACTUALIZACION_MS);
  }

  // Al salir de la pantalla se apaga el sondeo; si no, seguiría consultando al
  // servidor en segundo plano.
  ngOnDestroy(): void {
    if (this.intervaloId) {
      clearInterval(this.intervaloId);
    }
  }

  // Pide al servidor las órdenes activas y reemplaza el tablero completo.
  cargarOrdenes(): void {
    this.ordenesService.obtenerOrdenesActivas().subscribe({
      next: (ordenes) => {
        this.ordenes.set(ordenes);
        this.cargando.set(false);
        this.error.set('');
      },
      error: (error: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : 'No se pudieron cargar las comandas.',
        );
      },
    });
  }

  // Botón de cada tarjeta: mueve la comanda al estado siguiente.
  avanzar(orden: Orden): void {
    const siguiente = SIGUIENTE_ESTADO[orden.estado];
    if (!siguiente || !this.puedeAvanzar()) {
      return;
    }

    this.actualizandoOrdenId.set(orden.id);
    this.ordenesService.avanzarEstado(orden.id, siguiente).subscribe({
      next: () => {
        this.actualizandoOrdenId.set(null);
        this.cargarOrdenes();
      },
      error: (error: HttpErrorResponse) => {
        this.actualizandoOrdenId.set(null);
        this.error.set(error.error?.error || 'No se pudo actualizar la orden. Intenta de nuevo.');
        // Si otra persona ya la movió (409), se refresca para ver el estado real.
        if (error.status === 409) {
          this.cargarOrdenes();
        }
      },
    });
  }

  // Minutos enteros desde que se registró la venta.
  minutosEsperando(fechaCreacion: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(fechaCreacion).getTime()) / 60000));
  }

  // Texto legible del tiempo de espera ("recién llegada", "hace 12 min").
  tiempoTranscurrido(fechaCreacion: string): string {
    const minutos = this.minutosEsperando(fechaCreacion);
    if (minutos < 1) {
      return 'recién llegada';
    }
    if (minutos === 1) {
      return 'hace 1 min';
    }
    return `hace ${minutos} min`;
  }

  // true si la comanda ya lleva demasiado esperando (se resalta en rojo).
  esUrgente(orden: Orden): boolean {
    return this.minutosEsperando(orden.fecha_creacion) >= MINUTOS_PARA_RESALTAR;
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
