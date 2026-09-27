// =============================================================================
// core/inactividad.ts — CIERRE DE SESIÓN POR INACTIVIDAD (RNF-01)
// =============================================================================
// Si nadie toca la pantalla durante MINUTOS_INACTIVIDAD, la sesión se cierra
// sola, para que una caja o computadora desatendida no quede abierta con
// acceso a ventas y dinero.
//
// CÓMO FUNCIONA
//   1. Al iniciar sesión, app.ts llama a iniciar(): se empiezan a escuchar
//      eventos de actividad (clic, teclado, toque, scroll, movimiento del
//      mouse) y se arranca un reloj que revisa cada segundo.
//   2. Cada evento de actividad actualiza `ultimaActividad` (una hora).
//   3. Cada segundo se compara la hora actual con `ultimaActividad`:
//        - Faltan ≤ SEGUNDOS_AVISO  → se muestra el aviso "Tu sesión se
//          cerrará en N s" con el botón "Seguir conectado".
//        - Ya se cumplió el tiempo   → se cierra la sesión y el login explica
//          el motivo.
//   4. Al cerrar sesión, app.ts llama a detener() y se limpia todo.
//
// Se compara contra la HORA REAL (no se cuentan ticks del reloj): así también
// cierra bien si la computadora estuvo suspendida o la pestaña dormida.
// =============================================================================
import { Injectable, NgZone, signal } from '@angular/core';
import { AuthService } from './auth';

// RNF-01: cierre de sesión automático por inactividad.
// El reporte no fija el tiempo, así que se eligió uno razonable para un
// punto de venta: suficiente para que un cajero no pierda la sesión entre
// clientes, y corto para que una caja desatendida no quede abierta.
// Para cambiar el tiempo basta con modificar estas dos constantes.
export const MINUTOS_INACTIVIDAD = 20;
export const SEGUNDOS_AVISO = 60;

// Eventos del navegador que cuentan como "la persona sigue aquí".
const EVENTOS_ACTIVIDAD = ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'];

@Injectable({ providedIn: 'root' })
export class InactividadService {
  // Segundos que faltan para cerrar la sesión; null mientras no toca avisar.
  // app.html lee esta señal para mostrar u ocultar el aviso.
  segundosRestantes = signal<number | null>(null);

  // Última vez (en milisegundos) que se detectó actividad.
  private ultimaActividad = Date.now();
  private temporizador?: ReturnType<typeof setInterval>;
  // Se guarda la función en una propiedad para poder quitar EXACTAMENTE el
  // mismo listener al detener (removeEventListener exige la misma referencia).
  private readonly alActividad = () => this.registrarActividad();

  constructor(
    private authService: AuthService,
    private zona: NgZone,
  ) {}

  // Empieza a vigilar la actividad. Se llama cuando hay sesión iniciada.
  iniciar(): void {
    // Se detiene antes por si ya estaba corriendo (evita listeners duplicados).
    this.detener();
    this.ultimaActividad = Date.now();
    // Fuera de la zona de Angular: mousemove/scroll dispararían detección de
    // cambios en cada evento sin que nada visible cambie.
    this.zona.runOutsideAngular(() => {
      for (const evento of EVENTOS_ACTIVIDAD) {
        window.addEventListener(evento, this.alActividad, { passive: true });
      }
      // Se compara contra la hora real (no se cuentan ticks): así también
      // cierra bien si la computadora estuvo suspendida.
      this.temporizador = setInterval(() => this.revisar(), 1000);
    });
  }

  // Deja de vigilar: quita los listeners, apaga el reloj y oculta el aviso.
  detener(): void {
    for (const evento of EVENTOS_ACTIVIDAD) {
      window.removeEventListener(evento, this.alActividad);
    }
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = undefined;
    }
    this.segundosRestantes.set(null);
  }

  // Botón "Seguir conectado" del aviso.
  continuarSesion(): void {
    this.registrarActividad(true);
  }

  // Anota que hubo actividad. Mientras el aviso está visible, solo el botón
  // (desdeAviso = true) puede cancelarlo.
  private registrarActividad(desdeAviso = false): void {
    // Una vez que el aviso está visible, solo el botón lo descarta: un
    // movimiento de mouse casual no debe ocultarlo sin que la persona lo vea.
    if (this.segundosRestantes() !== null && !desdeAviso) {
      return;
    }
    this.ultimaActividad = Date.now();
    if (desdeAviso) {
      // Se vuelve a entrar a la zona de Angular para que la pantalla se
      // actualice y el aviso desaparezca.
      this.zona.run(() => this.segundosRestantes.set(null));
    }
  }

  // Se ejecuta cada segundo: decide si toca avisar, cerrar o no hacer nada.
  private revisar(): void {
    const inactivoSegundos = (Date.now() - this.ultimaActividad) / 1000;
    const limite = MINUTOS_INACTIVIDAD * 60;
    const restantes = Math.ceil(limite - inactivoSegundos);

    if (restantes <= 0) {
      // Tiempo cumplido: se apaga el vigilante y se cierra la sesión con un
      // mensaje que el login mostrará.
      this.zona.run(() => {
        this.detener();
        this.authService.logout('Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.');
      });
    } else if (restantes <= SEGUNDOS_AVISO) {
      // Ventana de aviso: se publica la cuenta regresiva para app.html.
      this.zona.run(() => this.segundosRestantes.set(restantes));
    }
  }
}
