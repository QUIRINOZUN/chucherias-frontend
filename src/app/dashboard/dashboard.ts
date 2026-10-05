// =============================================================================
// dashboard/dashboard.ts — MENÚ PRINCIPAL DE MÓDULOS (filtrado por rol)
// =============================================================================
// Es la pantalla a la que se llega tras iniciar sesión. Muestra una tarjeta por
// cada módulo al que el usuario tiene permiso. Cada rol ve solo lo suyo:
//
//   administrador → Punto de venta, Comandas, Corte de caja, Ventas de hoy, Usuarios, Inventario, Mermas, Asistencias
//   encargado     → Punto de venta, Comandas, Corte de caja, Ventas de hoy, Usuarios, Inventario, Mermas, Asistencias
//   cajero        → Punto de venta, Comandas (consulta), Corte de caja
//   auxiliar      → Comandas
//
// PARA AGREGAR UN MÓDULO NUEVO: añade su entrada a MODULOS (ruta, título,
// ícono, descripción y roles) y registra la misma ruta con rolGuard en
// app.routes.ts. La lista de roles debe coincidir con la del backend.
//
// WIDGET DE AUTOSERVICIO (Sprint 3): además de los módulos, cualquier rol
// salvo administrador ve aquí mismo un botón para marcar su propia entrada/
// salida — para cuando el personal no inicia/cierra sesión por turno (ej.
// un dispositivo de mostrador que se queda logueado todo el día), caso en
// el que la asistencia automática por login/logout (routes/auth.js) no
// aplica. Respeta la misma ventana horaria del negocio que el backend.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../core/auth';
import { ThemeService } from '../core/theme';
import { AsistenciasService, MiEstadoHoy } from '../core/asistencias';

// Descripción de una tarjeta del menú.
interface Modulo {
  // URL de la pantalla (debe existir en app.routes.ts).
  ruta: string;
  titulo: string;
  // Nombre del ícono del sprite SVG de index.html (id "ic-<icono>").
  icono: string;
  descripcion: string;
  // Roles que pueden ver (y abrir) este módulo.
  roles: string[];
}

// Cada módulo declara qué roles pueden verlo, con los mismos permisos que
// ya aplica el backend (ver core/auth-guard.ts y las rutas del API). El
// administrador siempre ve todo lo que existe hoy en el sistema.
const MODULOS: Modulo[] = [
  {
    ruta: '/pos',
    titulo: 'Punto de venta',
    icono: 'bolsa',
    descripcion: 'Menú, carrito y cobro.',
    roles: ['administrador', 'encargado', 'cajero'],
  },
  {
    ruta: '/comandas',
    titulo: 'Comandas',
    icono: 'comanda',
    descripcion: 'Pedidos en preparación y por entregar.',
    roles: ['administrador', 'encargado', 'cajero', 'auxiliar'],
  },
  {
    ruta: '/caja',
    titulo: 'Corte de caja',
    icono: 'billetes',
    descripcion: 'Resumen del día y registrar corte.',
    roles: ['administrador', 'encargado', 'cajero'],
  },
  {
    ruta: '/ventas',
    titulo: 'Ventas de hoy',
    icono: 'recibo',
    descripcion: 'Historial y cancelación de ventas.',
    roles: ['administrador', 'encargado'],
  },
  {
    ruta: '/usuarios',
    titulo: 'Usuarios',
    icono: 'usuarios',
    descripcion: 'Cuentas, roles y permisos.',
    roles: ['administrador', 'encargado'],
  },
  {
    ruta: '/inventario',
    titulo: 'Inventario',
    icono: 'paquete',
    descripcion: 'Insumos, existencias y proveedores.',
    roles: ['administrador', 'encargado'],
  },
  {
    ruta: '/mermas',
    titulo: 'Mermas',
    icono: 'picante',
    descripcion: 'Reporte de producto e insumo perdidos.',
    roles: ['administrador', 'encargado'],
  },
  {
    ruta: '/asistencias',
    titulo: 'Asistencias',
    icono: 'reloj',
    descripcion: 'Personal, entradas, salidas e historial.',
    roles: ['administrador', 'encargado'],
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit {
  // Solo los módulos cuyo listado de roles incluye el rol del usuario en
  // sesión. Se recalcula solo si cambia el usuario. Si no hay rol (o ningún
  // módulo lo incluye) la plantilla muestra el mensaje de "sin módulos".
  modulosVisibles = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return MODULOS.filter((modulo) => rol && modulo.roles.includes(rol));
  });

  // El administrador no lleva asistencia (ver nota de diseño de Sprint 3);
  // para el resto de roles se muestra el widget si el servidor confirma que
  // su cuenta sí está ligada a un empleado.
  esAdministrador = computed(() => this.authService.usuarioActual()?.rol === 'administrador');

  miEstadoHoy = signal<MiEstadoHoy | null>(null);
  procesandoMiAsistencia = signal(false);
  errorMiAsistencia = signal('');

  constructor(
    // `public` para que la plantilla muestre el nombre/rol y llame a logout().
    public authService: AuthService,
    public themeService: ThemeService,
    private asistenciasService: AsistenciasService,
  ) {}

  ngOnInit(): void {
    if (!this.esAdministrador()) {
      this.cargarMiEstadoHoy();
    }
  }

  cargarMiEstadoHoy(): void {
    this.asistenciasService.miHoy().subscribe({
      next: (estado) => this.miEstadoHoy.set(estado),
      error: () => {
        // El widget simplemente no se muestra; el resto del dashboard sigue
        // funcionando con normalidad.
      },
    });
  }

  marcarMiAsistencia(): void {
    const estado = this.miEstadoHoy();
    if (!estado) {
      return;
    }
    this.procesandoMiAsistencia.set(true);
    this.errorMiAsistencia.set('');

    const accion = estado.abierta
      ? this.asistenciasService.marcarMiSalida()
      : this.asistenciasService.marcarMiEntrada();

    accion.subscribe({
      next: () => {
        this.procesandoMiAsistencia.set(false);
        this.cargarMiEstadoHoy();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoMiAsistencia.set(false);
        this.errorMiAsistencia.set(error.error?.error || 'No se pudo registrar tu asistencia.');
      },
    });
  }
}
