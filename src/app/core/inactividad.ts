import { Injectable, NgZone, signal } from '@angular/core';
import { AuthService } from './auth';

// RNF-01: cierre de sesión automático por inactividad.
// El reporte no fija el tiempo, así que se eligió uno razonable para un
// punto de venta: suficiente para que un cajero no pierda la sesión entre
// clientes, y corto para que una caja desatendida no quede abierta.
export const MINUTOS_INACTIVIDAD = 20;
export const SEGUNDOS_AVISO = 60;

const EVENTOS_ACTIVIDAD = ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'];

@Injectable({ providedIn: 'root' })
export class InactividadService {
  // Segundos que faltan para cerrar la sesión; null mientras no toca avisar.
  segundosRestantes = signal<number | null>(null);

  private ultimaActividad = Date.now();
  private temporizador?: ReturnType<typeof setInterval>;
  private readonly alActividad = () => this.registrarActividad();

  constructor(
    private authService: AuthService,
    private zona: NgZone,
  ) {}

  iniciar(): void {
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

  private registrarActividad(desdeAviso = false): void {
    // Una vez que el aviso está visible, solo el botón lo descarta: un
    // movimiento de mouse casual no debe ocultarlo sin que la persona lo vea.
    if (this.segundosRestantes() !== null && !desdeAviso) {
      return;
    }
    this.ultimaActividad = Date.now();
    if (desdeAviso) {
      this.zona.run(() => this.segundosRestantes.set(null));
    }
  }

  private revisar(): void {
    const inactivoSegundos = (Date.now() - this.ultimaActividad) / 1000;
    const limite = MINUTOS_INACTIVIDAD * 60;
    const restantes = Math.ceil(limite - inactivoSegundos);

    if (restantes <= 0) {
      this.zona.run(() => {
        this.detener();
        this.authService.logout('Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.');
      });
    } else if (restantes <= SEGUNDOS_AVISO) {
      this.zona.run(() => this.segundosRestantes.set(restantes));
    }
  }
}
