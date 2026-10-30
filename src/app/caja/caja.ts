// =============================================================================
// caja/caja.ts — PANTALLA DE CORTE DE CAJA (RF-04)
// =============================================================================
// Cuatro PESTAÑAS (2026-10-22; antes las 4 vivían todas en la misma pantalla,
// apiladas o en una cuadrícula de 2 columnas en pantallas anchas — el usuario
// pidió separar qué se puede HACER en cada una, mismo criterio que ya usan
// Asistencias/Recetario/Reportes):
//   1. CORTE DE HOY: lo que el sistema calculó que debería haber hoy
//      (ventas en efectivo, apertura, ingresos y retiros, transferencia y
//      total) + la captura de lo contado físicamente, con la diferencia EN
//      VIVO ("Cuadra exacto", "Sobran $X", "Faltan $X"). Administrador,
//      encargado y cajero.
//   2. RETIROS: el formulario para emitir un retiro de efectivo (SOLO
//      administrador — para pagar proveedores o comprar insumos en el día;
//      el cajero lo confirma del lado del POS, donde se le imprime su
//      comprobante) + el ticket "Listado de retiros" de hoy, disponible a
//      los tres roles que hacen corte.
//   3. MOVIMIENTOS DE HOY (solo administrador y encargado): apertura,
//      ingresos y retiros del día.
//   4. HISTORIAL (solo administrador y encargado): consulta de cortes
//      anteriores con filtros por rango de fechas y por usuario.
//
// El total del sistema lo calcula siempre el servidor; aquí solo se muestra.
// Cambiar de pestaña no vuelve a pedir nada al servidor — los 4 bloques de
// datos ya se cargan una sola vez en ngOnInit, igual que en reportes.ts.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/auth';
import { CajaService, CorteCaja, ListadoRetiros, MovimientoCaja, ResumenCaja } from '../core/caja';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import { ThemeService } from '../core/theme';
import { Usuario, UsuariosService } from '../core/usuarios';

// Solo estos roles pueden registrar un corte (ver POST /api/caja/corte), así
// que solo ellos tienen sentido como opción del filtro por usuario.
const ROLES_QUE_HACEN_CORTE = ['administrador', 'encargado', 'cajero'];

// Denominaciones reales de billetes y monedas MXN — mismas constantes que ya
// usa pos.ts para el conteo de efectivo del cobro (2026-10-26/28, con su
// propia ilustración vectorial en public/img/billetes|monedas/).
const DENOMINACIONES_BILLETES_MXN = [20, 50, 100, 200, 500, 1000];
const DENOMINACIONES_MONEDAS_MXN = [1, 2, 5, 10];

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FocoDialogoDirective],
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class CajaComponent implements OnInit {
  // ---- Pestañas (2026-10-22, ver cabecera del archivo) ----------------------
  pestanaActiva = signal<'corte' | 'retiros' | 'movimientos' | 'historial'>('corte');

  cambiarPestana(pestana: 'corte' | 'retiros' | 'movimientos' | 'historial'): void {
    this.pestanaActiva.set(pestana);
  }

  // ---- Bloque 1: resumen calculado por el sistema --------------------------
  resumen = signal<ResumenCaja | null>(null);
  cargando = signal(true);
  error = signal('');

  // ---- Ticket "Listado de retiros" (2026-10-12) -----------------------------
  // Acumula todos los retiros del día (confirmados o no) para imprimirlos de
  // un vistazo al hacer el corte — visible a los tres roles que hacen corte,
  // no solo administrador/encargado (a diferencia de movimientosHoy abajo).
  listadoRetiros = signal<ListadoRetiros | null>(null);
  cargandoListadoRetiros = signal(false);
  errorListadoRetiros = signal('');

  // ---- Bloque 2: retiro de efectivo (solo administrador) -------------------
  montoRetiro = signal<number | null>(null);
  motivoRetiro = signal('');
  registrandoRetiro = signal(false);
  errorRetiro = signal('');
  // Último retiro que ESTE administrador acaba de emitir: se muestra como
  // confirmación en pantalla mientras el cajero lo ve y lo confirma en el POS.
  retiroEmitido = signal<MovimientoCaja | null>(null);

  // ---- Bloque 3: captura de lo contado físicamente -------------------------
  // null = todavía no se ha contado/escrito nada en ese campo.
  //
  // CONTEO DE EFECTIVO POR DENOMINACIÓN (2026-10-30): reemplaza el campo
  // numérico libre de antes — en vez de teclear un total estimado, se cuenta
  // billete por billete y moneda por moneda (el gesto real de un corte de
  // caja físico), y `efectivoContado` se recalcula solo como la suma. Mismo
  // patrón exacto que ya usa pos.ts para el cobro en efectivo
  // (conteoEfectivo/agregarDenominacion/quitarDenominacion), adaptado aquí:
  // alimenta efectivoContado en vez de montoRecibido. Transferencia sigue
  // siendo un solo número (no hay "denominaciones" de una transferencia).
  denominacionesBilletes = DENOMINACIONES_BILLETES_MXN;
  denominacionesMonedas = DENOMINACIONES_MONEDAS_MXN;
  conteoEfectivo = signal<Map<number, number>>(new Map());
  hayConteoEfectivo = computed(() => this.conteoEfectivo().size > 0);

  cantidadDenominacion(monto: number): number {
    return this.conteoEfectivo().get(monto) ?? 0;
  }

  agregarDenominacion(monto: number): void {
    this.conteoEfectivo.update((mapa) => {
      const nuevo = new Map(mapa);
      nuevo.set(monto, (nuevo.get(monto) ?? 0) + 1);
      return nuevo;
    });
    this.recalcularEfectivoDesdeConteo();
  }

  quitarDenominacion(monto: number): void {
    this.conteoEfectivo.update((mapa) => {
      const nuevo = new Map(mapa);
      const actual = nuevo.get(monto) ?? 0;
      if (actual <= 1) {
        nuevo.delete(monto);
      } else {
        nuevo.set(monto, actual - 1);
      }
      return nuevo;
    });
    this.recalcularEfectivoDesdeConteo();
  }

  // "Me equivoqué, vuelvo a empezar" — borrar un conteo de varias
  // denominaciones tocando "-" una por una sería tedioso.
  limpiarConteoEfectivo(): void {
    this.conteoEfectivo.set(new Map());
    this.efectivoContado.set(null);
  }

  private recalcularEfectivoDesdeConteo(): void {
    let suma = 0;
    for (const [monto, cantidad] of this.conteoEfectivo()) {
      suma += monto * cantidad;
    }
    this.efectivoContado.set(suma > 0 ? suma : null);
  }

  // Billetes/monedas con ilustración vectorial propia — mismos archivos ya
  // usados por el POS (public/img/billetes|monedas/).
  imagenBillete(monto: number): string | null {
    return DENOMINACIONES_BILLETES_MXN.includes(monto)
      ? `/img/billetes/billete_${monto}.svg`
      : null;
  }

  imagenMoneda(monto: number): string | null {
    return DENOMINACIONES_MONEDAS_MXN.includes(monto) ? `/img/monedas/moneda_${monto}.svg` : null;
  }

  efectivoContado = signal<number | null>(null);
  transferenciaContado = signal<number | null>(null);
  registrando = signal(false);
  errorRegistro = signal('');
  // Corte recién guardado: al tener valor, la pantalla muestra su resultado
  // en lugar del formulario.
  corteGuardado = signal<CorteCaja | null>(null);

  // ---- Bloque 4: historial de cortes y movimientos con filtros -------------
  historial = signal<CorteCaja[]>([]);
  cargandoHistorial = signal(false);
  errorHistorial = signal('');
  usuarios = signal<Usuario[]>([]);
  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroUsuarioId = signal<number | null>(null);
  // Movimientos de caja (apertura/ingreso/retiro) de HOY, para el historial.
  movimientosHoy = signal<MovimientoCaja[]>([]);

  // Consulta de historial en curso; se guarda para poder cancelarla.
  private consultaHistorial?: Subscription;

  // Solo administrador y encargado consultan cortes anteriores (RNF-03),
  // igual que ya restringe el backend en GET /api/caja/cortes.
  esAdministradorOEncargado = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return rol === 'administrador' || rol === 'encargado';
  });

  // Solo el administrador emite retiros de efectivo (decisión del negocio:
  // ni siquiera el encargado puede). El servidor lo vuelve a exigir.
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');

  // true si hay al menos un filtro aplicado (muestra "Limpiar filtros" y ajusta
  // el mensaje cuando no hay resultados).
  hayFiltros = computed(
    () => !!this.filtroDesde() || !!this.filtroHasta() || this.filtroUsuarioId() != null,
  );

  // Diferencia EN VIVO = (efectivo + transferencia contados) - total del sistema.
  //   > 0  sobra dinero   |   < 0  falta dinero   |   0  cuadra exacto.
  // Vale null hasta que se capturen ambos montos (un 0 SÍ cuenta como capturado).
  diferencia = computed(() => {
    const r = this.resumen();
    const efectivo = this.efectivoContado();
    const transferencia = this.transferenciaContado();
    if (!r || efectivo == null || transferencia == null) {
      return null;
    }
    return efectivo + transferencia - r.total_sistema;
  });

  constructor(
    private cajaService: CajaService,
    private usuariosService: UsuariosService,
    public authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarResumen();
    // El historial, los movimientos de hoy y el filtro de usuarios solo se
    // cargan para quien puede verlos.
    if (this.esAdministradorOEncargado()) {
      this.cargarHistorial();
      this.cargarMovimientosHoy();
      this.usuariosService.listar().subscribe({
        next: (usuarios) =>
          this.usuarios.set(usuarios.filter((u) => ROLES_QUE_HACEN_CORTE.includes(u.rol))),
        error: () => {
          // Sin la lista, el filtro por usuario simplemente queda vacío; la
          // consulta por fecha y el resto de la pantalla siguen funcionando.
        },
      });
    }
  }

  // Pide al servidor el resumen del día (lo que el sistema espera en caja).
  cargarResumen(): void {
    this.cargando.set(true);
    this.cajaService.obtenerResumen().subscribe({
      next: (resumen) => {
        this.resumen.set(resumen);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        // status 0 = sin respuesta (sin Internet o servidor gratuito dormido).
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : 'No se pudo calcular el resumen de caja.',
        );
        this.cargando.set(false);
      },
    });
  }

  // Movimientos de caja de HOY (apertura/ingreso/retiro), para el historial.
  cargarMovimientosHoy(): void {
    this.cajaService.obtenerMovimientos().subscribe({
      next: (movimientos) => this.movimientosHoy.set(movimientos),
      error: () => {
        // La lista simplemente queda vacía; el resto de la pantalla sigue funcionando.
      },
    });
  }

  // Pide el listado de retiros de hoy y abre el ticket imprimible.
  verListadoRetiros(): void {
    this.cargandoListadoRetiros.set(true);
    this.errorListadoRetiros.set('');
    this.cajaService.obtenerListadoRetiros().subscribe({
      next: (listado) => {
        this.listadoRetiros.set(listado);
        this.cargandoListadoRetiros.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorListadoRetiros.set(
          error.error?.error || 'No se pudo obtener el listado de retiros.',
        );
        this.cargandoListadoRetiros.set(false);
      },
    });
  }

  cerrarListadoRetiros(): void {
    this.listadoRetiros.set(null);
  }

  imprimirListadoRetiros(): void {
    window.print();
  }

  // Quita acentos/diacríticos y "¡"/"¿" — mismo motivo y misma técnica que
  // quitarAcentos() en pos.ts (ver textoPlanoListadoRetiros() abajo): el
  // controlador "Generic / Text Only" de Windows (impresoras térmicas sin
  // driver gráfico) imprime estos caracteres mal codificados. Se duplica
  // aquí porque vive en un componente distinto (mismo patrón ya repetido en
  // el proyecto para estilos/markup compartido entre POS y Caja).
  private quitarAcentos(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¡¿]/g, '');
  }

  // retiro.fecha llega como timestamp ISO completo (ver MovimientoCaja) —
  // se extrae solo HH:mm sin pasar por el pipe `date` de Angular, porque
  // textoPlanoListadoRetiros() ya arma el string completo a mano.
  private horaCorta(fechaIso: string): string {
    const fecha = new Date(fechaIso);
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
  }

  // listado.fecha llega como texto 'AAAA-MM-DD' (ver utils/fecha.js del
  // backend, que ya devuelve las columnas DATE como texto a propósito para
  // que el driver no las corra un día) — se reordena a dd/MM/yyyy con un
  // simple split, sin pasar por Date (evitaría el mismo corrimiento de zona
  // horaria ya documentado para otras fechas DATE en este proyecto).
  private fechaCortaDesdeIso(fechaIso: string): string {
    const [anio, mes, dia] = fechaIso.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  // Ticket "Listado de retiros" en TEXTO PLANO (2026-10-19): mismo respaldo
  // que textoPlanoTicket() en pos.ts, para la misma impresora térmica sin
  // driver gráfico — ver el comentario completo allá para el porqué. Oculto
  // en pantalla, visible SOLO al imprimir (ver @media print en caja.css).
  // Alineado a mano a 32 caracteres (ancho típico de una térmica de 58mm).
  textoPlanoListadoRetiros(listado: ListadoRetiros): string {
    const ANCHO = 32;
    const linea = (izquierda: string, derecha: string): string => {
      const i = this.quitarAcentos(izquierda);
      const d = this.quitarAcentos(derecha);
      const espacios = Math.max(1, ANCHO - i.length - d.length);
      return i + ' '.repeat(espacios) + d;
    };
    const centrado = (texto: string): string => {
      const t = this.quitarAcentos(texto);
      const espacios = Math.max(0, Math.floor((ANCHO - t.length) / 2));
      return ' '.repeat(espacios) + t;
    };
    const separador = '-'.repeat(ANCHO);
    const money = (n: number) => `$${n.toFixed(2)}`;

    const filas: string[] = [];
    filas.push(centrado('CHUCHERIAS MIX'));
    filas.push(centrado('Listado de retiros'));
    filas.push(centrado(this.fechaCortaDesdeIso(listado.fecha)));
    filas.push(separador);

    if (listado.retiros.length === 0) {
      filas.push(this.quitarAcentos('No hay retiros registrados hoy.'));
    } else {
      for (const retiro of listado.retiros) {
        filas.push(this.quitarAcentos(`${this.horaCorta(retiro.fecha)} - ${retiro.responsable}`));
        filas.push(linea('', money(+retiro.monto)));
        if (retiro.motivo) {
          filas.push(this.quitarAcentos(`  ${retiro.motivo}`));
        }
        if (!retiro.confirmado) {
          filas.push(this.quitarAcentos('  Sin confirmar por el cajero'));
        }
      }
      filas.push(separador);
      filas.push(linea('Total retirado', money(listado.total)));
    }
    filas.push('');

    return filas.join('\n');
  }

  // Habilita "Registrar retiro" solo con monto y motivo capturados y sin
  // exceder el efectivo disponible (el servidor vuelve a validar esto mismo
  // al guardar — aquí es solo para no dejar intentar un retiro imposible).
  puedeRegistrarRetiro(): boolean {
    const monto = this.montoRetiro();
    const disponible = this.resumen()?.total_efectivo ?? 0;
    return (
      monto != null &&
      monto > 0 &&
      monto <= disponible &&
      this.motivoRetiro().trim().length > 0 &&
      !this.registrandoRetiro()
    );
  }

  // true si lo capturado ya supera el efectivo disponible — para marcar el
  // campo en rojo antes de intentar guardar.
  retiroExcedeDisponible(): boolean {
    const monto = this.montoRetiro();
    const disponible = this.resumen()?.total_efectivo ?? 0;
    return monto != null && monto > disponible;
  }

  // Emite el retiro: el cajero lo verá en el POS (polling de
  // /retiros-pendientes) y lo confirmará ahí, donde se imprime su comprobante.
  registrarRetiro(): void {
    if (!this.puedeRegistrarRetiro()) {
      return;
    }
    this.registrandoRetiro.set(true);
    this.errorRetiro.set('');

    this.cajaService
      .registrarMovimiento('retiro', this.montoRetiro()!, this.motivoRetiro().trim())
      .subscribe({
        next: (movimiento) => {
          this.registrandoRetiro.set(false);
          this.retiroEmitido.set(movimiento);
          this.montoRetiro.set(null);
          this.motivoRetiro.set('');
          // El resumen y el historial cambian de inmediato (el retiro ya
          // descuenta del total del sistema aunque el cajero no lo haya
          // confirmado todavía — ver resumenCajaDelDia en el backend).
          this.cargarResumen();
          this.cargarMovimientosHoy();
        },
        error: (error: HttpErrorResponse) => {
          this.registrandoRetiro.set(false);
          this.errorRetiro.set(error.error?.error || 'No se pudo registrar el retiro.');
        },
      });
  }

  // Botón "Registrar otro" de la tarjeta "Retiro emitido": vuelve al formulario.
  nuevoRetiro(): void {
    this.retiroEmitido.set(null);
  }

  // Consulta el historial aplicando los filtros actuales.
  cargarHistorial(): void {
    // Si el usuario cambia otro filtro antes de que responda la consulta
    // anterior, se cancela: de lo contrario una respuesta vieja y lenta
    // podría llegar después y pisar el resultado de los filtros actuales.
    this.consultaHistorial?.unsubscribe();
    this.cargandoHistorial.set(true);
    this.errorHistorial.set('');
    this.consultaHistorial = this.cajaService
      .obtenerHistorial({
        desde: this.filtroDesde(),
        hasta: this.filtroHasta(),
        responsableId: this.filtroUsuarioId(),
      })
      .subscribe({
        next: (historial) => {
          this.historial.set(historial);
          this.cargandoHistorial.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.errorHistorial.set(
            error.error?.error || 'No se pudo consultar el historial de cortes.',
          );
          this.cargandoHistorial.set(false);
        },
      });
  }

  // Los tres manejadores siguientes se llaman al cambiar cada filtro: guardan
  // el valor y vuelven a consultar de inmediato.
  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarHistorial();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarHistorial();
  }

  // El selector entrega texto: '' = "Todos"; cualquier otro valor es un id.
  cambiarUsuario(valor: string): void {
    this.filtroUsuarioId.set(valor === '' ? null : Number(valor));
    this.cargarHistorial();
  }

  // Borra los tres filtros y muestra todos los cortes.
  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroUsuarioId.set(null);
    this.cargarHistorial();
  }

  // Convierte el texto del campo en número; vacío o inválido = null (sin
  // capturar). "Efectivo contado" ya no se escribe a mano — se calcula solo
  // desde el conteo por denominación (ver arriba) — este método se queda
  // solo para Transferencias, que sí sigue siendo un monto libre.
  actualizarTransferenciaContado(valor: string): void {
    const numero = Number(valor);
    this.transferenciaContado.set(valor === '' || Number.isNaN(numero) ? null : numero);
  }

  // El botón "Guardar corte" solo se habilita con AMBOS montos capturados y sin
  // otro guardado en curso.
  puedeRegistrar(): boolean {
    return (
      this.efectivoContado() != null && this.transferenciaContado() != null && !this.registrando()
    );
  }

  // Guarda el corte: envía SOLO lo contado; el servidor calcula el total del
  // sistema y la diferencia por su cuenta.
  registrarCorte(): void {
    if (!this.puedeRegistrar()) {
      return;
    }
    this.registrando.set(true);
    this.errorRegistro.set('');

    this.cajaService
      .registrarCorte({
        total_efectivo_contado: this.efectivoContado()!,
        total_transferencia_contado: this.transferenciaContado()!,
      })
      .subscribe({
        next: (corte) => {
          this.registrando.set(false);
          this.corteGuardado.set(corte);
          // Se recarga en vez de anteponerlo a la lista: la respuesta del
          // POST no trae el nombre del responsable y el corte nuevo podría
          // quedar fuera de los filtros activos.
          if (this.esAdministradorOEncargado()) {
            this.cargarHistorial();
          }
        },
        error: (error: HttpErrorResponse) => {
          this.registrando.set(false);
          this.errorRegistro.set(error.error?.error || 'No se pudo guardar el corte de caja.');
        },
      });
  }

  // Botón "Hecho" de la tarjeta "Corte guardado": regresa al formulario limpio
  // y vuelve a calcular el resumen.
  nuevoCorte(): void {
    this.corteGuardado.set(null);
    this.efectivoContado.set(null);
    this.conteoEfectivo.set(new Map());
    this.transferenciaContado.set(null);
    this.errorRegistro.set('');
    this.cargarResumen();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ---- Eliminar historial (2026-10-29): solo administrador, acción
  // irreversible — borra cortes de caja Y movimientos del rango elegido. ----
  mostrarEliminarHistorial = signal(false);
  desdeEliminarHistorial = signal('');
  hastaEliminarHistorial = signal('');
  eliminandoHistorial = signal(false);
  errorEliminarHistorial = signal('');
  resultadoEliminarHistorial = signal<string | null>(null);

  abrirEliminarHistorial(): void {
    this.mostrarEliminarHistorial.set(true);
    this.desdeEliminarHistorial.set('');
    this.hastaEliminarHistorial.set('');
    this.errorEliminarHistorial.set('');
    this.resultadoEliminarHistorial.set(null);
  }

  cerrarEliminarHistorial(): void {
    if (this.eliminandoHistorial()) {
      return;
    }
    this.mostrarEliminarHistorial.set(false);
  }

  puedeEliminarHistorial(): boolean {
    return (
      !!this.desdeEliminarHistorial() &&
      !!this.hastaEliminarHistorial() &&
      this.hastaEliminarHistorial() >= this.desdeEliminarHistorial() &&
      !this.eliminandoHistorial()
    );
  }

  confirmarEliminarHistorial(): void {
    if (!this.puedeEliminarHistorial()) {
      return;
    }
    this.eliminandoHistorial.set(true);
    this.errorEliminarHistorial.set('');
    this.cajaService
      .eliminarHistorial(this.desdeEliminarHistorial(), this.hastaEliminarHistorial())
      .subscribe({
        next: (respuesta) => {
          this.eliminandoHistorial.set(false);
          this.resultadoEliminarHistorial.set(
            `Se eliminaron ${respuesta.eliminados.cortes} corte(s) y ${respuesta.eliminados.movimientos} movimiento(s) del rango indicado.`,
          );
          this.cargarHistorial();
          this.cargarMovimientosHoy();
          this.cargarResumen();
        },
        error: (error: HttpErrorResponse) => {
          this.eliminandoHistorial.set(false);
          this.errorEliminarHistorial.set(
            error.error?.error || 'No se pudo eliminar el historial.',
          );
        },
      });
  }
}
