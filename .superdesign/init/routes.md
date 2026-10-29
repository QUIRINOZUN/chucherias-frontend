# CHUCHERIAS — routes.md

Fuente: `src/app/app.routes.ts` (completo abajo). 15 rutas protegidas + login
pública + catch-all. Cada ruta usa `authGuard` (sesión iniciada) y, salvo
`/dashboard`, también `rolGuard(...roles)` (lista de roles permitidos — debe
coincidir con `requiereRol` del backend).

## Tabla de rutas

| Path | Componente | Guard (roles) | Qué renderiza |
|---|---|---|---|
| `/login` | `LoginComponent` | — (pública) | Formulario de usuario/contraseña, panel de marca dividido |
| `/dashboard` | `DashboardComponent` | `authGuard` (cualquier sesión) | Menú de tarjetas por módulo, filtrado por rol; franja "Resumen de hoy" |
| `/pos` | `PosComponent` | administrador, encargado, cajero | Catálogo + carrito + cobro (punto de venta) |
| `/usuarios` | `UsuariosComponent` | administrador, encargado | CRUD de cuentas de personal |
| `/caja` | `CajaComponent` | administrador, encargado, cajero | Corte de caja en 4 pestañas (Corte de hoy / Retiros / Movimientos / Historial) |
| `/ventas` | `HistorialVentasComponent` | administrador, encargado | Consulta general de tickets (filtros, búsqueda, cancelación) |
| `/comandas` | `ComandasComponent` | administrador, encargado, cajero (solo lectura), auxiliar | Tablero de cocina en 3 columnas de estado |
| `/inventario` | `InventarioComponent` | administrador, encargado | Insumos, existencias calculadas, proveedores |
| `/mermas` | `MermasComponent` | administrador, encargado | Reporte consolidado de mermas (producto + insumo) |
| `/asistencias` | `AsistenciasComponent` | administrador, encargado | Personal: Hoy / Empleados / Horarios (calendario) / Historial |
| `/recetario` | `RecetarioComponent` | administrador, encargado | Recetas por variante + gestión del menú (categorías/productos/variantes) |
| `/clientes` | `ClientesComponent` | administrador, encargado | Catálogo de clientes y programa de lealtad |
| `/reportes` | `ReportesComponent` | administrador, encargado | Dashboard de reportes en 5 pestañas (General/Ventas/Inventario/Personal/Clientes) |
| `/checklist` | `ChecklistComponent` | administrador, encargado, cajero, auxiliar | Pasos de apertura/cierre del negocio |
| `/nomina` | `NominaComponent` | administrador, encargado | Pago del personal por horas trabajadas |
| `/ventas-especiales` | `VentasEspecialesComponent` | administrador, encargado, cajero | Agenda y cotización de eventos especiales |
| `''` | redirect → `/login` | — | — |
| `'**'` | redirect → `/login` | — | — |

## Archivo completo (`src/app/app.routes.ts`)

```ts
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
//   /recetario  → administrador, encargado                (recetario: insumos por variante)
//   /clientes   → administrador, encargado                (Sprint 4: clientes y lealtad)
//   /reportes   → administrador, encargado                (RF-26: reporte consolidado)
//   /checklist  → todos los roles operativos               (checklist de apertura/cierre)
//   /nomina     → administrador, encargado                (nómina por horas trabajadas)
//   /ventas-especiales → administrador, encargado, cajero   (agendar y cotizar)
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
import { RecetarioComponent } from './recetario/recetario';
import { ClientesComponent } from './clientes/clientes';
import { ReportesComponent } from './reportes/reportes';
import { ChecklistComponent } from './checklist/checklist';
import { NominaComponent } from './nomina/nomina';
import { VentasEspecialesComponent } from './ventas-especiales/ventas-especiales';
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
  // Consulta de tickets (filtros/búsqueda) y cancelación (2026-10-22; antes
  // solo mostraba el día en curso — ver historial-ventas.ts).
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
  // Recetario: insumos que lleva cada variante del menú.
  {
    path: 'recetario',
    component: RecetarioComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Clientes y programa de lealtad (Sprint 4: RF-21 a RF-23).
  {
    path: 'clientes',
    component: ClientesComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Reporte consolidado — ventas, inventario, personal y clientes (RF-26).
  {
    path: 'reportes',
    component: ReportesComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Checklist de apertura/cierre — cualquier rol operativo puede marcarlo
  // (según la entrevista), no solo administrador/encargado.
  {
    path: 'checklist',
    component: ChecklistComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero', 'auxiliar')],
  },
  // Nómina por horas trabajadas — información salarial, igual criterio que
  // Reportes/Caja/Asistencias (RNF-03).
  {
    path: 'nomina',
    component: NominaComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado')],
  },
  // Ventas especiales: agendar y cotizar desayunos, comidas y sorpresas con
  // el menú completo — mismos roles que ya cobran en el POS.
  {
    path: 'ventas-especiales',
    component: VentasEspecialesComponent,
    canActivate: [authGuard, rolGuard('administrador', 'encargado', 'cajero')],
  },
  // La raíz del sitio y cualquier URL desconocida llevan al login. (La pantalla
  // de login no redirige sola al dashboard si ya hay sesión: quien tenga la
  // sesión abierta entra al menú desde el botón "Ingresar" o escribiendo /dashboard.)
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
```

## Guards (`src/app/core/auth-guard.ts`, completo)

```ts
// =============================================================================
// core/auth-guard.ts — PROTECCIÓN DE RUTAS DEL FRONTEND
// =============================================================================
// Un "guard" decide si el navegador puede entrar a una ruta (URL) de la app.
// Aquí hay dos, y se combinan en app.routes.ts:
//   authGuard      → ¿hay sesión iniciada?   (si no → al login)
//   rolGuard(...)  → ¿el rol del usuario está permitido?  (si no → al dashboard)
//
// Ejemplo (app.routes.ts):
//   canActivate: [authGuard, rolGuard('administrador', 'encargado')]
//
// Esto aplica tanto al navegar por los botones como al escribir la URL a mano.
// OJO: es protección de EXPERIENCIA. La seguridad real está en el backend
// (middleware/auth.js), que rechaza cualquier petición sin permiso aunque
// alguien se salte estos guards.
// =============================================================================
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth';

// Se coloca en cualquier ruta que requiera sesión iniciada.
// Si no hay sesión, redirige automáticamente al login.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.estaAutenticado()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

// Se coloca junto a authGuard en rutas que además deben limitarse a ciertos
// roles (ej. canActivate: [authGuard, rolGuard('administrador')]). Si el
// usuario no tiene un rol permitido, lo regresa al dashboard en vez de
// dejarlo entrar por URL directa.
// Es una FÁBRICA: recibe la lista de roles y devuelve el guard configurado.
export function rolGuard(...rolesPermitidos: string[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const usuario = authService.usuarioActual();
    if (usuario && rolesPermitidos.includes(usuario.rol)) {
      return true;
    }

    router.navigate(['/dashboard']);
    return false;
  };
}
```

## Matriz de roles → módulos visibles (replicada en `dashboard.ts`, debe coincidir)

| Rol | Módulos visibles |
|---|---|
| administrador | los 15 (todos) |
| encargado | los mismos 15 que administrador |
| cajero | Punto de venta, Comandas (lectura), Corte de caja, Ventas especiales, Checklist |
| auxiliar | Comandas, Checklist |
