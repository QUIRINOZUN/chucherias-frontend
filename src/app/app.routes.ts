// =============================================================================
// app.routes.ts — MAPA DE PANTALLAS (RUTAS) DEL FRONTEND
// =============================================================================
// Define qué pantalla se muestra en cada URL y quién puede entrar.
// Cada ruta protegida usa dos guards (core/auth-guard.ts):
//   authGuard  → exige sesión iniciada.
//   rolGuard() → exige que el rol del usuario esté en la lista.
//
// TABLA DE ACCESO
//   /login      → pública.
//   /dashboard  → cualquier usuario con sesión (menú filtrado por rol).
//   /pos        → administrador, encargado, cajero        (Sprint 1)
//   /caja       → administrador, encargado, cajero        (Sprint 1)
//   /ventas     → administrador, encargado                (Sprint 1)
//   /usuarios   → administrador, encargado                (Sprint 1)
//   /comandas   → administrador, encargado, cajero (solo consulta), auxiliar (Sprint 2)
//   /inventario → administrador, encargado                (módulo de inventario)
//   /mermas     → administrador, encargado                (reporte consolidado de mermas)
//   /asistencias → administrador, encargado                (Sprint 3: personal y asistencias)
//
// Estas reglas deben coincidir con las del backend (requiereRol en routes/*.js)
// y con la lista de módulos del dashboard (dashboard/dashboard.ts).
// =============================================================================
import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { DashboardComponent } from './dashboard/dashboard';
import { PosComponent } from './pos/pos';
import { ComandasComponent } from './comandas/comandas';
import { UsuariosComponent } from './usuarios/usuarios';
import { CajaComponent } from './caja/caja';
import { HistorialVentasComponent } from './historial-ventas/historial-ventas';
import { InventarioComponent } from './inventario/inventario';
import { MermasComponent } from './mermas/mermas';
import { AsistenciasComponent } from './asistencias/asistencias';
import { authGuard, rolGuard } from './core/auth-guard';

export const routes: Routes = [
  // Pantalla de inicio de sesión: la única sin protección.
  { path: 'login', component: LoginComponent },
  // Menú principal tras iniciar sesión.
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  // Punto de venta: menú, carrito y cobro.
  {
    path: 'pos',
    component: PosComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero')],
  },
  // Gestión de cuentas de personal (crear/editar/desactivar solo admin,
  // pero el encargado puede consultar la lista).
  {
    path: 'usuarios',
    component: UsuariosComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Corte de caja: resumen del día, captura de lo contado e historial.
  {
    path: 'caja',
    component: CajaComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero')],
  },
  // Historial de ventas del día y cancelación.
  {
    path: 'ventas',
    component: HistorialVentasComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Tablero de comandas de cocina (Sprint 2). El cajero entra en modo consulta.
  {
    path: 'comandas',
    component: ComandasComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero', 'auxiliar')],
  },
  // Inventario: insumos, existencias calculadas y proveedores.
  {
    path: 'inventario',
    component: InventarioComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Reporte consolidado de mermas (producto + insumo, con filtros).
  {
    path: 'mermas',
    component: MermasComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Control de personal: empleados y asistencias (Sprint 3).
  {
    path: 'asistencias',
    component: AsistenciasComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // La raíz del sitio y cualquier URL desconocida llevan al login. (La pantalla
  // de login no redirige sola al dashboard si ya hay sesión: quien tenga la
  // sesión abierta entra al menú desde el botón "Ingresar" o escribiendo /dashboard.)
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
