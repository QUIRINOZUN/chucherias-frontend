import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { DashboardComponent } from './dashboard/dashboard';
import { PosComponent } from './pos/pos';
import { UsuariosComponent } from './usuarios/usuarios';
import { CajaComponent } from './caja/caja';
import { HistorialVentasComponent } from './historial-ventas/historial-ventas';
import { authGuard, rolGuard } from './core/auth-guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  {
    path: 'pos',
    component: PosComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero')],
  },
  {
    path: 'usuarios',
    component: UsuariosComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  {
    path: 'caja',
    component: CajaComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero')],
  },
  {
    path: 'ventas',
    component: HistorialVentasComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];