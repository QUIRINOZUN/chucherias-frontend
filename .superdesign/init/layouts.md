# CHUCHERIAS — layouts.md

## Shell raíz (`src/app/app.*`)

Es solo un router-outlet + un aviso global flotante de inactividad (RNF-01). No
hay ningún layout de navegación persistente (sidebar, topbar global) — cada
pantalla es responsable de su propio encabezado "Volver" (ver patrón de
encabezado más abajo).

**`app.ts`** (completo):
```ts
// =============================================================================
// app.ts — COMPONENTE RAÍZ (<app-root>)
// =============================================================================
// Es el contenedor de toda la aplicación. Su plantilla (app.html) contiene:
//   - <router-outlet>: el lugar donde Angular pinta la pantalla actual
//     (login, dashboard, POS, caja…).
//   - El aviso global de "tu sesión se cerrará por inactividad" (RNF-01).
//
// Su única lógica es encender o apagar el control de inactividad según haya o
// no una sesión iniciada.
// =============================================================================
import { Component, effect, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth';
import { InactividadService } from './core/inactividad';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('chucherias-frontend');

  constructor(
    private authService: AuthService,
    // `protected` para que la plantilla pueda leer segundosRestantes y llamar
    // a continuarSesion() desde el aviso de inactividad.
    protected inactividad: InactividadService,
  ) {
    // El control de inactividad solo corre mientras hay sesión iniciada
    // (incluye recargar la página con un token guardado).
    // `effect` se vuelve a ejecutar cada vez que cambia usuarioActual: al
    // iniciar sesión arranca el temporizador; al cerrarla, se detiene.
    effect(() => {
      if (this.authService.usuarioActual()) {
        this.inactividad.iniciar();
      } else {
        this.inactividad.detener();
      }
    });
  }
}
```

**`app.html`** (completo):
```html
<!-- app.html — PLANTILLA RAÍZ (lógica en app.ts) -->
<!-- AQUÍ se pinta la pantalla actual según la ruta (login, dashboard, POS, caja…). -->
<router-outlet></router-outlet>

<!-- AVISO DE INACTIVIDAD (RNF-01): aparece cuando faltan 60 segundos para cerrar la sesión.
     Solo el botón "Seguir conectado" lo cancela. -->
@if (inactividad.segundosRestantes(); as restantes) {
  <div class="aviso-inactividad" role="alertdialog" aria-live="assertive" aria-label="Aviso de inactividad">
    <p>Tu sesión se cerrará en {{ restantes }} s por inactividad.</p>
    <button type="button" (click)="inactividad.continuarSesion()">Seguir conectado</button>
  </div>
}
```

**`app.css`** (completo):
```css
/* =============================================================================
   app.css — ESTILOS DEL COMPONENTE RAÍZ
   =============================================================================
   Solo contiene el aviso de inactividad (RNF-01), que flota sobre cualquier
   pantalla. Los colores salen de los tokens globales de styles.css. */

/* Tarjeta fija en la parte baja de la pantalla, por encima de todo (z-index alto). */
.aviso-inactividad {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 16px;
  max-width: 420px;
  margin: 0 auto;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: var(--radio-lg);
  border: 1px solid var(--action-danger);
  background: var(--pos-bg-card);
  color: var(--pos-text-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

/* Mensaje con la cuenta regresiva. */
.aviso-inactividad p {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

/* Botón "Seguir conectado" (acción principal en naranja de marca, área táctil de 44 px). */
.aviso-inactividad button {
  min-height: 44px;
  border: none;
  border-radius: var(--radio-lg);
  background: var(--action-primary);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}
```

---

## Patrón de ENCABEZADO DE PANTALLA (repetido en los ~14 módulos de gestión)

No es un componente Angular compartido — es un patrón COPIADO a mano en cada
`<modulo>.html`/`.css` (Angular no hereda estilos entre componentes), que se
apoya en reglas globales de `styles.css` compartidas por nombre de clase
(`.pos-header`, `.caja-header`, `.inventario-header`, etc. — ver la lista
completa en `theme.md`/`components.md`).

Estructura HTML siempre igual: `<header class="<modulo>-header">` con, en
orden, botón "Volver" → `.insignia-pantalla` (ícono circular) → `<h1>` → botón
de tema (sol/luna). El `:host` del componente fija `--acento-modulo: var(--mod-x)`,
que alimenta: la franja arcoíris (`::before`, 5px arriba), la textura de puntos
+ degradado de fondo del header, la raya sólida de 4px abajo, y el color de la
insignia — todo esto son reglas GLOBALES en `styles.css`, el componente solo
pone la variable y la clase.

### Ejemplo 1 — Dashboard (`dashboard.html` + `dashboard.css`, extracto)
El dashboard es un caso especial: NO fija `--acento-modulo` (usa el fallback
naranja de marca) y su `<h1>` es el saludo, no un título de módulo — por eso
tiene su propio breakpoint a 480px en vez del patrón `min-width:0` + 2 líneas
de los demás headers.

```html
<header class="dashboard-header">
  <img src="https://res.cloudinary.com/isjkpamh/.../chucherias/marca/xnua730fuk6dau2nsko1.png"
       alt="Chucherías" class="dashboard-logo" />
  <div class="dashboard-header-texto">
    @if (authService.usuarioActual(); as usuario) {
      <h1>Hola, {{ usuario.nombre }}</h1>
      <p class="dashboard-rol"><span class="rol-pastilla">{{ usuario.rol }}</span></p>
    }
  </div>
  <button type="button" class="boton-tema" (click)="themeService.alternarTema()">
    <svg class="icono" aria-hidden="true">
      <use [attr.href]="themeService.tema() === 'dark' ? '#ic-sol' : '#ic-luna'" />
    </svg>
  </button>
</header>
```
```css
.dashboard-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--pos-bg-card);
}
.dashboard-header-texto { order: 3; flex: 1 1 100%; min-width: 0; }
.dashboard-logo { order: 1; flex-shrink: 0; width: clamp(100px, 32vw, 260px); height: auto;
  filter: drop-shadow(0 6px 18px rgba(194, 65, 12, 0.35)); }
.boton-tema { order: 2; margin-left: auto; }
@media (min-width: 480px) {
  .dashboard-header { flex-wrap: nowrap; }
  .dashboard-header-texto { order: initial; flex: 1; margin-left: 0; }
  .dashboard-logo, .boton-tema { order: initial; margin-left: 0; }
}
```

### Ejemplo 2 — Inventario (`inventario.html` + `inventario.css`, encabezado real completo)
Este es el patrón "estándar" que repiten los otros 13 módulos de gestión.

```html
<header class="inventario-header">
  <button type="button" class="boton-volver" (click)="volverAlDashboard()">
    <svg class="icono" aria-hidden="true"><use href="#ic-volver" /></svg>
    Volver
  </button>
  <span class="insignia-pantalla" aria-hidden="true">
    <svg class="icono"><use href="#ic-paquete" /></svg>
  </span>
  <h1>Inventario</h1>
  <button type="button" class="boton-tema" (click)="themeService.alternarTema()"
    [attr.aria-label]="themeService.tema() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'">
    <svg class="icono" aria-hidden="true">
      <use [attr.href]="themeService.tema() === 'dark' ? '#ic-sol' : '#ic-luna'" />
    </svg>
  </button>
</header>
```
```css
:host {
  --acento-modulo: var(--mod-inventario);
  display: block;
  min-height: 100vh;
  background: var(--pos-bg-main);
  font-family: var(--fuente-texto);
  color: var(--pos-text-primary);
  animation: aparecer 0.22s ease;
}

.inventario-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--pos-bg-card);
  border-bottom: 1px solid var(--pos-border);
  position: sticky;
  top: 0;
  z-index: 5;
}

.inventario-header h1 {
  flex: 1;
  margin: 0;
  font-size: 1.25rem;
  font-family: var(--fuente-titulo);
}

.boton-volver,
.boton-tema {
  min-height: 44px;
  border: none;
  background: var(--pos-bg-main);
  color: var(--pos-text-primary);
  border-radius: var(--radio-pastilla);
  padding: 0 18px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.boton-tema {
  min-width: 44px;
  padding: 0;
  font-size: 1.15rem;
}
```
Nota: el `.inventario-header` usa `position: sticky; top: 0;` — algunos módulos
(ej. `caja.css`) también lo hacen, otros no; no es 100% uniforme entre pantallas.

### Reglas CSS compartidas que decoran TODOS los headers (viven en `styles.css`, no se repiten por módulo)
Ver el bloque completo (textura de puntos + franja arcoíris + raya de 4px +
`min-width:0`/line-clamp del `<h1>`) en `theme.md`, selector agrupado:
```css
.pos-header, .caja-header, .historial-header, .usuarios-header, .comandas-header,
.dashboard-header, .mermas-header, .asistencias-header, .inventario-header,
.recetario-header, .clientes-header, .reportes-header, .checklist-header,
.nomina-header, .ventas-especiales-header { /* textura + raya de acento */ }

.pos-header h1, .caja-header h1, /* ... (sin .dashboard-header h1) */ {
  min-width: 0; overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.pos-header::before, .caja-header::before, /* ...incluye .dashboard-header::before */,
.login-marca::before (definido aparte en login.css con la misma variable) {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 5px;
  background: var(--franja-arcoiris);
}

.insignia-pantalla { /* sello circular con halo, usa --acento-modulo */ }
```

### Body de pantalla: dos layouts reales distintos tras el header
1. **Columna centrada con max-width** (Inventario, Caja, Usuarios, Mermas,
   Asistencias, Recetario, Clientes, Nómina, Checklist, Ventas especiales):
   `.inventario-cuerpo { max-width: 720px; width: 100%; margin: 0 auto; }`,
   que crece a 2 columnas (`flex-direction: row`, controles `sticky` a la
   izquierda) sobre 860px en Inventario específicamente.
2. **Layout de app completa, sin max-width centrado** (POS, Comandas): el POS
   es catálogo + carrito (hoja deslizable en móvil / barra lateral fija desde
   860px); Comandas es 3 columnas de estado que se apilan en móvil.

---

## `src/index.html` (completo)

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Chucherías</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Ícono real de la marca (2026-10-16), reemplaza el favicon default de
         Angular CLI. favicon.ico (multi-resolución 16/32/48/256) cubre el
         fallback de navegadores/crawlers que piden /favicon.ico directo sin
         leer este <link>; icon.png (192×192) es el que usan los navegadores
         modernos que prefieren PNG. Ambos generados con sharp/png-to-ico a
         partir del icon.png original (1254×1254) que se compartió para esto
         — demasiado pesado (~1 MB) para servirlo tal cual en cada carga. -->
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="icon" type="image/png" sizes="192x192" href="icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <!-- Fraunces gana los ejes variables SOFT y WONK (2026-10-13): antes solo
         se pedían opsz/wght, así que Google servía una instancia sin acceso
         a esos ejes en tiempo real. SOFT redondea los remates (menos rígido)
         y WONK activa las alternas "chuecas" a propósito — el estilo
         juguetón/hecho a mano de Fraunces, pensado para títulos, no para
         texto de lectura. Se usan solo en encabezados (ver styles.css),
         nunca en el texto de cuerpo/datos. -->
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Fraunces:SOFT,WONK,opsz,wght@0..100,0..1,9..144,600..800&display=swap"
      rel="stylesheet"
    />
    <script>
      // Aplica el tema guardado antes de que Angular arranque, para evitar
      // un parpadeo del tema por defecto al cargar la página.
      (function () {
        try {
          var tema = localStorage.getItem('tema');
          document.documentElement.setAttribute('data-theme', tema === 'light' ? 'light' : 'dark');
        } catch (e) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      })();
    </script>
  </head>
  <body>
    <!-- Set de íconos SVG (trazo de 2px, esquinas redondeadas). Se usan con
         <svg class="icono"><use href="#ic-nombre" /></svg>; heredan el color
         del texto (currentColor). Un solo sprite evita una librería de íconos. -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      style="position: absolute"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Categorías -->
      <symbol id="ic-hamburguesa" viewBox="0 0 24 24">
        <path d="M4 10c0-3.5 3.6-6 8-6s8 2.5 8 6z" />
        <path d="M3 13h18" />
        <path d="M4 16.5h16v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M8 7.5h.01M12 6.5h.01M16 7.5h.01" />
      </symbol>
      <symbol id="ic-pizza" viewBox="0 0 24 24">
        <path d="M12 21.5 3 6.5c5.6-2.7 12.4-2.7 18 0z" />
        <circle cx="10" cy="9.5" r="1" />
        <circle cx="14.5" cy="10" r="1" />
        <circle cx="12" cy="14" r="1" />
      </symbol>
      <symbol id="ic-alitas" viewBox="0 0 24 24">
        <path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23" />
        <path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59" />
      </symbol>
      <symbol id="ic-boneless" viewBox="0 0 24 24">
        <path
          d="M6 9c0-3 3-5 6-4.5s6.5 1.5 6.5 5-1 4-1.5 6-3.5 4-6.5 3.5S5 17 5.5 13.5 6 11 6 9z"
        />
        <path d="M10 10h.01M14 12.5h.01M10.5 15h.01" />
      </symbol>
      <symbol id="ic-papas" viewBox="0 0 24 24">
        <path d="M5 11h14l-1.5 10h-11z" />
        <path d="M8 11V4.5M12 11V3M16 11V5" />
      </symbol>
      <symbol id="ic-picante" viewBox="0 0 24 24">
        <path
          d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        />
      </symbol>
      <symbol id="ic-elote" viewBox="0 0 24 24">
        <path d="M12 3c3 2 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-7 4-9z" />
        <path d="M12 3v18M8.3 9h7.4M8 13h8M9 17h6" />
      </symbol>
      <symbol id="ic-sobre" viewBox="0 0 24 24">
        <path d="M6 3h12l1.5 3-1.5 15H6L4.5 6z" />
        <path d="M4.5 6h15" />
        <circle cx="12" cy="13.5" r="2.5" />
      </symbol>
      <symbol id="ic-fruta" viewBox="0 0 24 24">
        <path d="M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z" />
        <path d="M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z" />
        <path d="M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12" />
        <path d="M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z" />
      </symbol>
      <symbol id="ic-waffle" viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="M9.5 3.5v17M14.5 3.5v17M3.5 9.5h17M3.5 14.5h17" />
      </symbol>
      <symbol id="ic-vaso" viewBox="0 0 24 24">
        <path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8" />
        <path d="M5 8h14" />
        <path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" />
        <path d="m12 8 1-6h2" />
      </symbol>
      <symbol id="ic-botella" viewBox="0 0 24 24">
        <path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z" />
        <path d="M8 13h8" />
      </symbol>
      <symbol id="ic-cubiertos" viewBox="0 0 24 24">
        <path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9" />
        <path d="M17 3c-2 1.5-3 4-3 7h3v11" />
      </symbol>
      <symbol id="ic-todas" viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      </symbol>
      <!-- Interfaz -->
      <symbol id="ic-bolsa" viewBox="0 0 24 24">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </symbol>
      <symbol id="ic-billetes" viewBox="0 0 24 24">
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 12h.01M18 12h.01" />
      </symbol>
      <symbol id="ic-recibo" viewBox="0 0 24 24">
        <path
          d="M5 2.5v19l2-1.3 2 1.3 2-1.3 2 1.3 2-1.3 2 1.3 2-1.3V2.5l-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"
        />
        <path d="M9 8.5h6M9 12.5h6M9 16.5h3" />
      </symbol>
      <symbol id="ic-usuarios" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>
      <symbol id="ic-comanda" viewBox="0 0 24 24">
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1M9 11h6M9 15h4" />
      </symbol>
      <symbol id="ic-reloj" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </symbol>
      <symbol id="ic-calendario" viewBox="0 0 24 24">
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M7.5 13.5h3M7.5 17h3M13.5 13.5h3M13.5 17h3" />
      </symbol>
      <symbol id="ic-cocinar" viewBox="0 0 24 24">
        <path
          d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"
        />
        <path d="M6 17h12" />
      </symbol>
      <symbol id="ic-paquete" viewBox="0 0 24 24">
        <path
          d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
        />
        <path d="M12 22V12M3.3 7 12 12l8.7-5M7.5 4.27l9 5.15" />
      </symbol>
      <symbol id="ic-sol" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        />
      </symbol>
      <symbol id="ic-luna" viewBox="0 0 24 24">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
      </symbol>
      <symbol id="ic-cerrar" viewBox="0 0 24 24">
        <path d="M18 6 6 18M6 6l12 12" />
      </symbol>
      <symbol id="ic-chevron" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </symbol>
      <symbol id="ic-volver" viewBox="0 0 24 24">
        <path d="m12 19-7-7 7-7M19 12H5" />
      </symbol>
      <symbol id="ic-siguiente" viewBox="0 0 24 24">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </symbol>
      <symbol id="ic-buscar" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </symbol>
      <symbol id="ic-mas" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </symbol>
      <symbol id="ic-menos" viewBox="0 0 24 24">
        <path d="M5 12h14" />
      </symbol>
      <symbol id="ic-check" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
      </symbol>
      <symbol id="ic-camara" viewBox="0 0 24 24">
        <path
          d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        />
        <circle cx="12" cy="13" r="4" />
      </symbol>
      <symbol id="ic-corazon" viewBox="0 0 24 24">
        <path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"
        />
      </symbol>
      <symbol id="ic-grafica" viewBox="0 0 24 24">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </symbol>
      <symbol id="ic-calculadora" viewBox="0 0 24 24">
        <rect x="4" y="2.5" width="16" height="19" rx="2" />
        <path d="M7 6.5h10" />
        <path
          d="M7 11.5h.01M12 11.5h.01M17 11.5h.01M7 15.5h.01M12 15.5h.01M17 15.5h.01M7 19h.01M12 19h.01M17 19h.01"
        />
      </symbol>
      <symbol id="ic-regalo" viewBox="0 0 24 24">
        <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
        <path d="M3.5 9h17M12 9v11" />
        <path
          d="M12 9c-1.2-3.5-3.4-5-5-4-1.6 1-1 3 1 3.5 1 .25 2.7.5 4 .5ZM12 9c1.2-3.5 3.4-5 5-4 1.6 1 1 3-1 3.5-1 .25-2.7.5-4 .5Z"
        />
      </symbol>
    </svg>
    <app-root></app-root>
  </body>
</html>
```

(Nota: el sprite tiene 33 símbolos reales; no todos los íconos usados en el
código tienen un `<symbol>` visible arriba si el módulo se extendió después de
la última vez que se tocó `index.html` — confirmar contra `grep "ic-"` del
HTML de cada módulo si Superdesign necesita un ícono que no aparece aquí.)
