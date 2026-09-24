import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { ThemeService } from '../core/theme';

interface Modulo {
  ruta: string;
  titulo: string;
  icono: string;
  descripcion: string;
  roles: string[];
}

// Cada módulo declara qué roles pueden verlo, con los mismos permisos que
// ya aplica el backend (ver core/auth-guard.ts y las rutas del API). El
// administrador siempre ve todo lo que existe hoy en el sistema.
const MODULOS: Modulo[] = [
  {
    ruta: '/pos',
    titulo: 'Punto de venta',
    icono: '🛒',
    descripcion: 'Menú, carrito y cobro.',
    roles: ['administrador', 'encargado', 'cajero'],
  },
  {
    ruta: '/caja',
    titulo: 'Corte de caja',
    icono: '💰',
    descripcion: 'Resumen del día y registrar corte.',
    roles: ['administrador', 'encargado', 'cajero'],
  },
  {
    ruta: '/ventas',
    titulo: 'Ventas de hoy',
    icono: '🧾',
    descripcion: 'Historial y cancelación de ventas.',
    roles: ['administrador', 'encargado'],
  },
  {
    ruta: '/usuarios',
    titulo: 'Usuarios',
    icono: '👥',
    descripcion: 'Cuentas, roles y permisos.',
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
export class DashboardComponent {
  modulosVisibles = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return MODULOS.filter((modulo) => rol && modulo.roles.includes(rol));
  });

  constructor(
    public authService: AuthService,
    public themeService: ThemeService,
  ) {}
}
