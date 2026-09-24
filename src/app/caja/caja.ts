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
  resumen = signal<ResumenCaja | null>(null);
  cargando = signal(true);
  error = signal('');

  efectivoContado = signal<number | null>(null);
  transferenciaContado = signal<number | null>(null);
  registrando = signal(false);
  errorRegistro = signal('');
  corteGuardado = signal<CorteCaja | null>(null);

  historial = signal<CorteCaja[]>([]);
  cargandoHistorial = signal(false);
  errorHistorial = signal('');
  usuarios = signal<Usuario[]>([]);
  filtroDesde = signal('');
  filtroHasta = signal('');
  filtroUsuarioId = signal<number | null>(null);

  private consultaHistorial?: Subscription;

  // Solo administrador y encargado consultan cortes anteriores (RNF-03),
  // igual que ya restringe el backend en GET /api/caja/cortes.
  esAdministradorOEncargado = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return rol === 'administrador' || rol === 'encargado';
  });

  hayFiltros = computed(
    () => !!this.filtroDesde() || !!this.filtroHasta() || this.filtroUsuarioId() != null,
  );

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

  cargarResumen(): void {
    this.cargando.set(true);
    this.cajaService.obtenerResumen().subscribe({
      next: (resumen) => {
        this.resumen.set(resumen);
        this.cargando.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(
          error.status === 0
            ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
            : 'No se pudo calcular el resumen de caja.',
        );
        this.cargando.set(false);
      },
    });
  }

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

  cambiarDesde(valor: string): void {
    this.filtroDesde.set(valor);
    this.cargarHistorial();
  }

  cambiarHasta(valor: string): void {
    this.filtroHasta.set(valor);
    this.cargarHistorial();
  }

  cambiarUsuario(valor: string): void {
    this.filtroUsuarioId.set(valor === '' ? null : Number(valor));
    this.cargarHistorial();
  }

  limpiarFiltros(): void {
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroUsuarioId.set(null);
    this.cargarHistorial();
  }

  actualizarEfectivoContado(valor: string): void {
    const numero = Number(valor);
    this.efectivoContado.set(valor === '' || Number.isNaN(numero) ? null : numero);
  }

  actualizarTransferenciaContado(valor: string): void {
    const numero = Number(valor);
    this.transferenciaContado.set(valor === '' || Number.isNaN(numero) ? null : numero);
  }

  puedeRegistrar(): boolean {
    return this.efectivoContado() != null && this.transferenciaContado() != null && !this.registrando();
  }

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
