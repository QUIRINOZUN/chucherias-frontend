# CHUCHERIAS — pages.md

Angular standalone no tiene "componentes hijos" importados como JSX — cada
pantalla es un único componente grande (`.ts` + `.html` + `.css`, mismo nombre,
mismo directorio) que importa servicios de `core/` para hablar con el backend y
unas pocas funciones/constantes de archivos locales a su propia carpeta (solo
en `pos/`: `categoria-estilos.ts`, `producto-ingredientes.ts`,
`producto-elecciones.ts`). No hay imports de otros componentes de pantalla.

Confirmado para las 6 páginas: cada `.ts` referenciado abajo tiene su `.html` y
`.css` viviendo en el mismo directorio con el mismo nombre base (`styleUrl`/
`templateUrl` relativos), nunca HTML/CSS inline.

---

## 1. `login` — `src/app/login/login.ts`
- **Componente**: `LoginComponent` (`selector: app-login`, `imports: [ReactiveFormsModule]`)
- **Servicios de `core/`**: `AuthService` (`../core/auth`) — único.
- **Otros archivos locales**: ninguno (sin `core/theme` aquí — el login tiene
  su paleta fija, sin alternar tema).
- **Plantilla/estilos**: `login.html`, `login.css` (mismo directorio).
- Angular modules usados: `ReactiveFormsModule`, `FormBuilder`, `Validators` (de `@angular/forms`).

## 2. `dashboard` — `src/app/dashboard/dashboard.ts`
- **Componente**: `DashboardComponent` (`selector: app-dashboard`, `imports: [RouterLink, CurrencyPipe]`)
- **Servicios de `core/`**:
  - `AuthService` (`../core/auth`) — usuario en sesión, logout.
  - `ThemeService` (`../core/theme`) — botón sol/luna.
  - `RecetasService` (`../core/recetas`) — badge "N variantes sin receta".
  - `CajaService` + tipo `ResumenCaja` (`../core/caja`) — franja "Resumen de hoy".
  - `AsistenciasService` (`../core/asistencias`) — "Personal en turno".
- **Otros archivos locales**: ninguno — toda la data de `MODULOS` (rutas,
  íconos, colores por rol) vive como constante dentro de `dashboard.ts` mismo.
- **Plantilla/estilos**: `dashboard.html`, `dashboard.css`.

## 3. `pos` — `src/app/pos/pos.ts`
- **Componente**: `PosComponent` (`selector: app-pos`, `imports: [CurrencyPipe, DatePipe, FocoDialogoDirective]`)
- **Servicios de `core/`** (el más grande del sistema):
  - `AuthService`, `ThemeService`
  - `CajaService` + `MovimientoCaja`, `TipoMovimientoCaja` (`../core/caja`)
  - `CatalogoService` + `Categoria`, `Producto`, `Variante` (`../core/catalogo`)
  - `ClientesService` + `Cliente` (`../core/clientes`)
  - `EmpleadosService` + `Repartidor` (`../core/empleados`)
  - `InsumosService` (`../core/insumos`) — mapa de costos extra por elección
  - `VentasService` + `MetodoPago`, `RespuestaVenta`, `TipoEntrega` (`../core/ventas`)
  - `FocoDialogoDirective` (`../core/foco-dialogo`) — en las ~5 ventanas `.overlay`
    propias del POS (detalle de producto, cobro, saldo inicial, ingresar
    efectivo, registrar cliente).
- **Otros archivos locales** (únicos del proyecto fuera de `core/`):
  - `./categoria-estilos` → `obtenerEstiloCategoria` (color + ícono por categoría real)
  - `./producto-ingredientes` → `IngredienteRemovible`, `obtenerIngredientesRemovibles`
  - `./producto-elecciones` → `GrupoEleccion`, `OpcionEleccion`, `obtenerEleccionesDeVariante`
- **Plantilla/estilos**: `pos.html` (1442 líneas), `pos.css` (2537 líneas — el
  archivo de estilos más grande del proyecto; presupuesto de Angular subido a
  30kB aviso / 42kB error en `angular.json` para acomodarlo).

## 4. `historial-ventas` (ruta `/ventas`) — `src/app/historial-ventas/historial-ventas.ts`
- **Componente**: `HistorialVentasComponent` (`selector: app-historial-ventas`, `imports: [CurrencyPipe, DatePipe]`)
- **Servicios de `core/`**:
  - `OrdenesService` + tipos `EstadoOrden`, `InsumoDescontado`, `TiempoEstadoOrden` (`../core/ordenes`) — panel "Ver tiempos".
  - `ThemeService`.
  - `VentasService` + varios tipos (import multilínea, incluye `FiltrosVentas`) de `../core/ventas` — listar con filtros, cancelar.
- **Otros archivos locales**: ninguno.
- **Plantilla/estilos**: `historial-ventas.html`, `historial-ventas.css`.
- Usa `Subscription` de `rxjs` para cancelar una consulta de filtros en vuelo
  si llega una nueva antes de que responda (mismo patrón en `reportes.ts`, `caja.ts`).

## 5. `reportes` — `src/app/reportes/reportes.ts`
- **Componente**: `ReportesComponent` (`selector: app-reportes`, `imports: [CurrencyPipe, DecimalPipe]`)
- **Servicios de `core/`**:
  - `ReportesService` + `ResumenReportes` (`../core/reportes`) — único endpoint,
    `GET /api/reportes/resumen`, consumido por las 5 pestañas.
  - `ThemeService`.
- **Otros archivos locales**: ninguno — las gráficas (línea de tendencia SVG,
  sparkline, barras, medidor) están dibujadas a mano dentro de `reportes.html`/`.ts`,
  sin librería de charts.
- **Plantilla/estilos**: `reportes.html` (777 líneas), `reportes.css` (842 líneas).

## 6. `caja` — `src/app/caja/caja.ts`
- **Componente**: `CajaComponent` (`selector: app-caja`, `imports: [CurrencyPipe, DatePipe, FocoDialogoDirective]`)
- **Servicios de `core/`**:
  - `AuthService`
  - `CajaService` + `CorteCaja`, `ListadoRetiros`, `MovimientoCaja`, `ResumenCaja` (`../core/caja`)
  - `FocoDialogoDirective` (`../core/foco-dialogo`)
  - `ThemeService`
  - `Usuario`, `UsuariosService` (`../core/usuarios`) — selector de usuario para filtrar el historial de cortes.
- **Otros archivos locales**: ninguno.
- **Plantilla/estilos**: `caja.html`, `caja.css`.
- Usa `Subscription` de `rxjs` (cancela consulta de historial en vuelo).

---

## Patrón general (válido para las 15 pantallas, no solo estas 6)
```
core/<dominio>.ts        → HttpClient + interfaces + métodos (listar/crear/editar/...)
<modulo>/<modulo>.ts     → Component: inyecta 1-6 servicios de core/, signals para estado
<modulo>/<modulo>.html   → plantilla con @if/@for (sintaxis Angular 17+, sin *ngIf/*ngFor)
<modulo>/<modulo>.css    → ViewEncapsulation por default — nada se hereda de otro .css
```
Toda petición HTTP pasa por `core/auth-interceptor.ts` (agrega el Bearer token
automáticamente) — ningún servicio de dominio necesita tocar headers de auth.
