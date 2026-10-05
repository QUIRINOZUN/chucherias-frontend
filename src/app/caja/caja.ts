// =============================================================================
// caja/caja.ts — PANTALLA DE CORTE DE CAJA (RF-04)
// =============================================================================
// Tiene cuatro bloques:
//   1. RESUMEN: lo que el sistema calculó que debería haber hoy, desglosado
//      en ventas en efectivo, apertura, ingresos y retiros (efectivo),
//      transferencia y total. Lo ven administrador, encargado y cajero.
//   2. RETIRO DE EFECTIVO (solo administrador): registra un retiro para
//      pagar proveedores o comprar insumos en el día. El cajero lo confirma
//      del lado del POS, donde se le imprime su comprobante — aquí solo se
//      emite.
//   3. CAPTURA DEL CORTE: la persona escribe lo que contó físicamente; la
//      pantalla muestra la diferencia EN VIVO ("Cuadra exacto", "Sobran $X",
//      "Faltan $X") y al guardar se registra el corte.
//   4. HISTORIAL (solo administrador y encargado): consulta de cortes
//      anteriores con filtros por rango de fechas y por usuario, y los
//      movimientos de caja (apertura/ingreso/retiro) del día.
//
// El total del sistema lo calcula siempre el servidor; aquí solo se muestra.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/auth';
import { CajaService, CorteCaja, MovimientoCaja, ResumenCaja } from '../core/caja';
import { ThemeService } from '../core/theme';
import { Usuario, UsuariosService } from '../core/usuarios';

// Solo estos roles pueden registrar un corte (ver POST /api/caja/corte), así
// que solo ellos tienen sentido como opción del filtro por usuario.
const ROLES_QUE_HACEN_CORTE = ['administrador', 'encargado', 'cajero'];

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class CajaComponent implements OnInit {
  // ---- Bloque 1: resumen calculado por el sistema --------------------------
  resumen = signal<ResumenCaja | null>(null);
  cargando = signal(true);
  error = signal('');

  // ---- Bloque 2: retiro de efectivo (solo administrador) -------------------
  montoRetiro = signal<number | null>(null);
  motivoRetiro = signal('');
  registrandoRetiro = signal(false);
  errorRetiro = signal('');
  // Último retiro que ESTE administrador acaba de emitir: se muestra como
  // confirmación en pantalla mientras el cajero lo ve y lo confirma en el POS.
  retiroEmitido = signal<MovimientoCaja | null>(null);

  // ---- Bloque 3: captura de lo contado físicamente -------------------------
  // null = todavía no se ha escrito nada en ese campo.
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

  // Convierten el texto del campo en número; vacío o inválido = null (sin capturar).
  actualizarEfectivoContado(valor: string): void {
    const numero = Number(valor);
    this.efectivoContado.set(valor === '' || Number.isNaN(numero) ? null : numero);
  }

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
    this.transferenciaContado.set(null);
    this.errorRegistro.set('');
    this.cargarResumen();
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
