// =============================================================================
// caja/caja.ts — PANTALLA DE CORTE DE CAJA (RF-04)
// =============================================================================
// Tiene tres bloques:
//   1. RESUMEN: lo que el sistema calculó que debería haber hoy (efectivo,
//      transferencia y total). Lo ven administrador, encargado y cajero.
//   2. CAPTURA DEL CORTE: la persona escribe lo que contó físicamente; la
//      pantalla muestra la diferencia EN VIVO ("Cuadra exacto", "Sobran $X",
//      "Faltan $X") y al guardar se registra el corte.
//   3. HISTORIAL (solo administrador y encargado): consulta de cortes
//      anteriores con filtros por rango de fechas y por usuario.
//
// El total del sistema lo calcula siempre el servidor; aquí solo se muestra.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/auth';
import { CajaService, CorteCaja, ResumenCaja } from '../core/caja';
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

  // ---- Bloque 2: captura de lo contado físicamente -------------------------
  // null = todavía no se ha escrito nada en ese campo.
  efectivoContado = signal<number | null>(null);
  transferenciaContado = signal<number | null>(null);
  registrando = signal(false);
  errorRegistro = signal('');
  // Corte recién guardado: al tener valor, la pantalla muestra su resultado
  // en lugar del formulario.
  corteGuardado = signal<CorteCaja | null>(null);

  // ---- Bloque 3: historial de cortes con filtros ---------------------------
  historial = signal<CorteCaja[]>([]);
  cargandoHistorial = signal(false);
  errorHistorial = signal('');
  usuarios = signal<Usuario[]>([]);
  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroUsuarioId = signal<number | null>(null);

  // Consulta de historial en curso; se guarda para poder cancelarla.
  private consultaHistorial?: Subscription;

  // Solo administrador y encargado consultan cortes anteriores (RNF-03),
  // igual que ya restringe el backend en GET /api/caja/cortes.
  esAdministradorOEncargado = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return rol === 'administrador' || rol === 'encargado';
  });

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
    // El historial y el filtro de usuarios solo se cargan para quien puede verlos.
    if (this.esAdministradorOEncargado()) {
      this.cargarHistorial();
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
          this.errorHistorial.set(error.error?.error || 'No se pudo consultar el historial de cortes.');
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
    return this.efectivoContado() != null && this.transferenciaContado() != null && !this.registrando();
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
