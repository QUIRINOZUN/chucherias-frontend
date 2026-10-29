# CHUCHERIAS — components.md

No existe una carpeta de componentes UI reutilizables (nada como `Button.tsx`/
`Card.tsx`). Angular's `ViewEncapsulation` por default significa que el CSS de
un componente NUNCA se hereda de otro — cada módulo **copia a mano** el mismo
patrón visual en su propio `.css`, repitiendo selectores con nombres iguales o
casi iguales (`.boton-confirmar`, `.overlay`, `.campo`, etc.) en archivo tras
archivo. Lo único realmente COMPARTIDO entre componentes son:
1. Reglas globales en `src/styles.css` (selector agrupado que lista las clases
   de cada módulo — ver `.pos-header, .caja-header, ...` en `theme.md`/`layouts.md`).
2. La directiva standalone `appFocoDialogo` (`core/foco-dialogo.ts`, código
   completo al final de este archivo) — el único "componente" reutilizable de
   verdad, aplicado a las 22 ventanas `.overlay` reales del sistema.

---

## 1. Tarjeta base (`.tarjeta-*`)

No hay una sola clase `.tarjeta` universal — cada módulo tiene su propia
(`.tarjeta-insumo`, `.tarjeta-modulo`, `.tarjeta-atencion` en Comandas, etc.)
pero todas comparten el mismo esqueleto:
```css
background: var(--pos-bg-card);
border: 1px solid var(--pos-border);
border-left: 4px solid var(--acento-modulo);   /* identidad de módulo */
border-radius: var(--radio-lg) var(--radio-lg) var(--radio-lg) 4px; /* esquina rota a propósito */
box-shadow: var(--sombra-suave);
padding: 14px 16px;                             /* o 20-26px en tarjetas más grandes */
transition: box-shadow .15s ease, transform .15s ease;
```
Ejemplo real — `.tarjeta-insumo` (`inventario.css`):
```css
.tarjeta-insumo {
  background: var(--pos-bg-card);
  border: 1px solid var(--pos-border);
  border-left: 4px solid var(--acento-modulo);
  border-radius: var(--radio-lg) var(--radio-lg) var(--radio-lg) 4px;
  box-shadow: var(--sombra-suave);
  padding: 14px 16px;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.tarjeta-insumo:hover { box-shadow: var(--sombra-elevada); transform: translateY(-1px); }
```
Variante "alerta" (solo tiñe 3 de 4 lados, deja el borde-identidad izquierdo intacto):
```css
.tarjeta-insumo.tarjeta-alerta {
  border-top-color: var(--action-danger);
  border-right-color: var(--action-danger);
  border-bottom-color: var(--action-danger);
}
```
Tarjeta de módulo del dashboard (`.tarjeta-modulo`, `dashboard.css`) usa el
mismo esqueleto pero como `<a>` completo (área táctil grande) con animación de
entrada escalonada — ver `extractable-components.md`.

---

## 2. Botones (primario / cancelar / peligro / éxito)

**Regla de color (2026-10-13, tercera ronda):** el naranja de marca
(`--action-primary` / `var(--mod-pos)`) es la acción principal **SOLO dentro
del POS**. En cada pantalla de gestión, su botón "principal" usa
`--acento-modulo` (el color propio de ese módulo), no el naranja. Verde/rojo
siguen siendo exclusivos de éxito/peligro en todas partes, nunca reemplazados
por el color de módulo.

**Botón primario de módulo** (ej. `.boton-nuevo-insumo`, `inventario.css`):
```css
.boton-nuevo-insumo {
  min-height: 56px;
  width: 100%;
  border: none;
  border-radius: var(--radio-md);
  background: var(--acento-modulo);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: var(--sombra-acento);
  transition: background-color 0.15s ease, transform 0.1s ease;
}
.boton-nuevo-insumo:hover { background: color-mix(in srgb, var(--acento-modulo) 85%, black); }
.boton-nuevo-insumo:active { transform: scale(0.98); }
```

**Botón confirmar/cancelar de un formulario dentro de `.panel-formulario`**
(mismo patrón en inventario/usuarios/recetario/asistencias):
```css
.boton-cancelar {
  flex: 1; min-height: 52px;
  border: 1px solid var(--pos-border);
  background: var(--pos-bg-main);
  color: var(--pos-text-primary);
  border-radius: var(--radio-md);
  cursor: pointer; font-size: 0.9rem;
}
.boton-confirmar {
  flex: 1; min-height: 52px;
  border: none;
  background: var(--acento-modulo);   /* --action-primary dentro del POS */
  color: #fff;
  border-radius: var(--radio-md);
  cursor: pointer; font-size: 0.9rem; font-weight: 700;
  box-shadow: var(--sombra-acento);
}
.boton-confirmar:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
```

**Botón primario DENTRO del POS** usa `--action-primary` crudo en vez de
`--acento-modulo` (porque `--mod-pos` YA es ese token) — ejemplo real,
`.boton-confirmar` de la ventana de cobro (`pos.css`):
```css
.boton-confirmar {
  flex: 2; min-height: 56px;
  border: none;
  background: var(--action-primary);
  color: #fff;
  border-radius: var(--radio-md);
  cursor: pointer; font-size: 1rem; font-weight: 800;
  box-shadow: var(--sombra-acento);
  transition: background-color 0.15s ease, transform 0.1s ease;
}
.boton-confirmar:hover:not(:disabled) { background: var(--action-primary-hover); }
.boton-confirmar:active:not(:disabled) { transform: scale(0.98); }
```

**Botón de peligro/éxito** (clase ad-hoc por módulo, ejemplo típico — no hay
una clase global `.boton-peligro`):
```css
/* patrón repetido con variaciones de tamaño en cada módulo */
background: var(--action-danger);  color: #fff;   /* cancelar, eliminar, retiro */
background: var(--action-success); color: #fff;   /* avanzar comanda final, marcar salida */
```

**Botón de encabezado** ("Volver" / tema sol-luna) — regla GLOBAL en
`styles.css`, reutilizada en los 14 headers:
```css
.boton-volver, .boton-tema {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  transition: background-color 0.15s ease, transform 0.1s ease;
}
.boton-volver:hover, .boton-tema:hover { background: var(--acento-suave) !important; }
.boton-volver:active, .boton-tema:active { transform: scale(0.96); }
```
(cada módulo SÍ define su propio tamaño/padding/border-radius de
`.boton-volver`/`.boton-tema` en su propio `.css` — la regla global solo
cubre hover/active/transition).

---

## 3. Chips / pastillas de filtro (`.chip-*`, `.pastilla-*`)

Patrón canónico en `inventario.css` (`.chip-categoria`), reutilizado con
nombres propios en Mermas/Historial-ventas/Reportes:
```css
.chip-categoria {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 14px;
  border: 1px solid var(--pos-border);
  border-radius: var(--radio-pastilla);
  background: var(--pos-bg-card);
  color: var(--pos-text-primary);
  font-size: 0.82rem; font-weight: 600; white-space: nowrap; cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}
.chip-categoria.chip-activa {
  border-color: var(--acento-modulo);
  background: var(--acento-modulo);
  color: #fff;
}
```
Variante con significado funcional propio (nivel de stock bajo/medio/alto) —
usa `--peligro-texto`/`--acento-texto`/`--exito-texto` en vez de
`--acento-modulo`, porque ese color YA tiene un significado (no es identidad
de módulo):
```css
.chip-nivel-bajo.chip-activa {
  border-color: var(--peligro-texto);
  background: color-mix(in srgb, var(--action-danger) 20%, var(--pos-bg-card));
  color: var(--peligro-texto);
}
```
Envoltorio con degradado de "hay más contenido a la derecha" (fila de chips
desplazable en móvil, repetido en Inventario/Caja/Reportes/Asistencias):
```css
.fila-chips-envoltorio { position: relative; }
.fila-chips-desvanecido {
  position: absolute; top: 0; right: 0; bottom: 4px; width: 28px;
  background: linear-gradient(to right, transparent, var(--pos-bg-main));
  pointer-events: none;
}
.fila-chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
```

---

## 4. Insignias circulares de ícono (`.insignia-pantalla`, `.modulo-icono`)

Ambas son "sello" circular + halo tenue (2026-10-13: reemplazó un cuadrado con
esquinas redondeadas, considerado "el molde genérico de cualquier plantilla").
`.insignia-pantalla` (global, `styles.css`, en el header de cada módulo):
```css
.insignia-pantalla {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; flex-shrink: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--acento-modulo, var(--action-primary)) 22%, var(--pos-bg-card));
  color: var(--acento-modulo, var(--action-primary));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acento-modulo, var(--action-primary)) 14%, transparent);
}
.insignia-pantalla .icono { width: 20px; height: 20px; }
```
`.modulo-icono` (local a `dashboard.css`, más grande, con hover que gira):
```css
.modulo-icono {
  width: 52px; height: 52px; display: grid; place-items: center; margin-bottom: 8px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--acento-modulo, var(--action-primary)) 20%, var(--pos-bg-card));
  color: var(--acento-modulo, var(--action-primary));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--acento-modulo, var(--action-primary)) 12%, transparent);
  transition: background-color .2s ease, color .2s ease, transform .25s ease;
}
@media (hover: hover) {
  .tarjeta-modulo:hover .modulo-icono {
    background: var(--acento-modulo, var(--action-primary));
    color: #fff;
    transform: rotate(-6deg) scale(1.06);
  }
}
```

---

## 5. Ventanas modales (`.overlay` + panel) + directiva `appFocoDialogo`

**Importante — hallazgo real**: `.overlay` NO es una única definición
compartida pese al nombre idéntico — cada componente la redefine, y hay DOS
geometrías distintas en producción bajo el mismo nombre de clase:

**Variante A — diálogo centrado** (Inventario, Usuarios, Recetario,
Asistencias — la mayoría de módulos de gestión), `inventario.css`:
```css
.overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 20;
  animation: aparecer 0.2s ease;
}
.panel-formulario {
  width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto;
  background: var(--pos-bg-card);
  border-radius: var(--radio-lg);
  border-top: 4px solid var(--acento-modulo);
  box-shadow: var(--sombra-elevada);
  padding: 24px; box-sizing: border-box;
  animation: escalar 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
```

**Variante B — hoja deslizable desde abajo** (POS, mobile-first), `pos.css`:
```css
.overlay {
  position: fixed; inset: 0;
  background: rgba(20, 8, 0, 0.6);
  backdrop-filter: blur(3px);
  display: flex; align-items: flex-end; justify-content: center;   /* ⚠ flex-end, no center */
  padding: 0; z-index: 40;
  animation: aparecer 0.2s ease;
}
.panel-cobro, .panel-detalle-producto {
  width: 100%; max-width: 100%; max-height: 92vh; overflow-y: auto;
  background: var(--pos-bg-card);
  border-radius: 28px 28px 0 0;    /* solo esquinas superiores — hoja, no tarjeta */
  box-shadow: var(--sombra-elevada);
  animation: subir 0.32s cubic-bezier(0.22, 1, 0.36, 1);  /* sube desde abajo, no escala */
}
```
En escritorio ancho (≥860px) el POS reutiliza la misma estructura pero con
`.panel-cobro-ancho`/`.panel-cobro-horizontal` para ensanchar y convertir en
grid de 2 columnas.

**Markup real con la directiva de foco** (idéntico patrón en las 22 ventanas):
```html
<div class="overlay">
  <div class="panel-formulario"
       role="dialog" aria-modal="true"
       [attr.aria-label]="modo === 'crear' ? 'Nuevo insumo' : 'Editar insumo'"
       appFocoDialogo
       (cerrarConEscape)="cerrarFormularioInsumo()">
    <!-- ... -->
  </div>
</div>
```
Reglas: el `role="dialog"`/`aria-modal`/`appFocoDialogo` van en el PANEL, nunca
en `.overlay` (el fondo oscuro). 2 excepciones documentadas: formularios de
crear/editar NO cierran al tocar el fondo (para no perder datos a medio
capturar) — solo Escape + botón; la ventana de "retiro pendiente" (sin botón
Cancelar) no liga `cerrarConEscape` a nada.

### `core/foco-dialogo.ts` (código completo — el único componente/directiva compartida de verdad)

```ts
// =============================================================================
// core/foco-dialogo.ts — PATRÓN DE DIÁLOGO ACCESIBLE PARA VENTANAS .overlay
// =============================================================================
// Auditoría de accesibilidad (2026-10-13, ver CLAUDE.md): las ~20 ventanas
// .overlay de los 5 módulos principales (pos/recetario/comandas/caja/
// asistencias/inventario/usuarios) no tenían manejo de foco ni rol de
// diálogo — se dejó pendiente por necesitar un patrón reutilizable en vez de
// 20 cambios puntuales. Esta directiva ES ese patrón: se agrega al elemento
// que ya recibe `role="dialog" aria-modal="true"` (el panel de contenido, NO
// el fondo oscuro) y hace tres cosas, estándar de cualquier diálogo (WAI-ARIA
// Authoring Practices):
//   1. Al abrirse, mueve el foco DENTRO del diálogo (su primer elemento
//      enfocable, o el panel mismo si no tiene ninguno).
//   2. Mientras está abierto, ATRAPA el Tab: no se puede tabular hacia algo
//      de atrás de la ventana.
//   3. Al cerrarse, devuelve el foco a donde estaba antes de abrir (el botón
//      que la abrió, normalmente) — sin esto, tras cerrar un diálogo con
//      teclado el foco "se pierde" (vuelve al <body>).
//
// Además emite `cerrarConEscape` para que la tecla Escape cierre la ventana
// igual que ya hace tocar el fondo oscuro — cada plantilla lo liga al mismo
// método que ya usa (click) en `.overlay`.
// =============================================================================
import {
  Directive,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  HostListener,
} from '@angular/core';

const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Directive({
  selector: '[appFocoDialogo]',
  standalone: true,
})
export class FocoDialogoDirective implements OnInit, OnDestroy {
  @Output() cerrarConEscape = new EventEmitter<void>();

  // Qué tenía el foco ANTES de abrirse este diálogo — para devolvérselo al
  // cerrar (ver ngOnDestroy).
  private elementoPrevio: HTMLElement | null = null;

  constructor(private elementoDialogo: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.elementoPrevio = document.activeElement as HTMLElement;
    // Se difiere un tick: el contenido del diálogo (recién creado por el
    // @if que lo muestra) puede no estar pintado todavía en este momento.
    setTimeout(() => this.enfocarPrimerElemento());
  }

  ngOnDestroy(): void {
    // Si el elemento ya no existe (ej. se eliminó de la lista que abrió el
    // diálogo), simplemente no se restaura nada — no es un error.
    this.elementoPrevio?.focus?.();
  }

  private enfocarPrimerElemento(): void {
    const host = this.elementoDialogo.nativeElement;
    const enfocables = host.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES);
    if (enfocables.length > 0) {
      enfocables[0].focus();
    } else {
      // Sin ningún control enfocable adentro (poco común, pero posible en
      // una ventana de solo lectura): el panel mismo recibe el foco.
      host.tabIndex = -1;
      host.focus();
    }
  }

  @HostListener('keydown', ['$event'])
  alTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      this.cerrarConEscape.emit();
      return;
    }
    if (evento.key !== 'Tab') {
      return;
    }

    const host = this.elementoDialogo.nativeElement;
    const enfocables = Array.from(host.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES)).filter(
      (el) => el.offsetParent !== null, // descarta los ocultos (display:none)
    );
    if (enfocables.length === 0) {
      return;
    }

    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    // Tab en el último → vuelve al primero; Shift+Tab en el primero →
    // salta al último. Así el foco nunca se "escapa" del diálogo mientras
    // esté abierto.
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }
}
```

---

## 6. Sistema de pestañas (`.tabs-*` / `.tab-*`)

Repetido con prefijo propio en Caja, Reportes, Asistencias, Recetario (sub-
pestañas), Checklist. Ejemplo real completo — `caja.css`:
```css
.tabs-caja-envoltorio { position: relative; }
.tabs-caja-desvanecido {
  position: absolute; top: 0; right: 0; bottom: 1px; width: 32px;
  background: linear-gradient(to right, transparent, var(--pos-bg-main));
  pointer-events: none;
}
.tabs-caja {
  display: flex; gap: 6px; padding-bottom: 2px;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.tab-caja {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 0 16px;
  border: none; border-radius: var(--radio-pastilla);
  background: var(--pos-bg-card);
  box-shadow: var(--sombra-suave);
  color: var(--pos-text-secondary);
  font-weight: 600; font-size: 0.85rem; cursor: pointer; white-space: nowrap;
  transition: background-color .15s ease, color .15s ease;
}
.tab-caja .icono { width: 18px; height: 18px; }
.tab-caja-activa {
  background: var(--acento-modulo);
  color: #fff;
  box-shadow: var(--sombra-acento);
}
.caja-pestana { display: flex; flex-direction: column; gap: 16px; animation: aparecer 0.2s ease; }
```
Patrón de componente: un signal `pestanaActiva` decide qué sección mostrar con
`@if (pestanaActiva() === '...')`; TODOS los datos se cargan una sola vez en
`ngOnInit` (cambiar de pestaña nunca vuelve a pedir nada al servidor).

---

## 7. Skeleton de carga (`.esqueleto`)

Base GLOBAL en `styles.css`:
```css
.esqueleto { position: relative; overflow: hidden; background: var(--pos-bg-card); border-radius: var(--radio-sm); }
.esqueleto-en-tarjeta { background: color-mix(in srgb, var(--pos-text-primary) 12%, transparent); }
.esqueleto::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--pos-text-primary) 8%, transparent) 50%, transparent 70%);
  animation: brillo-esqueleto 1.6s ease-in-out infinite;
}
@keyframes brillo-esqueleto { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
```
Cada módulo compone su propia FORMA encima (ejemplo, `inventario.css`):
```css
.tarjeta-insumo-esqueleto { display: flex; justify-content: space-between; align-items: center;
  background: var(--pos-bg-card); border: 1px solid var(--pos-border);
  border-radius: var(--radio-lg); padding: 20px 16px; }
.tarjeta-insumo-esqueleto .esqueleto-linea-nombre { height: 14px; width: 45%; }
.tarjeta-insumo-esqueleto .esqueleto-linea-dato { height: 20px; width: 15%; }
```
Uso en plantilla (patrón repetido en todas las listas con skeleton):
```html
@if (cargando()) {
  <div class="lista-insumos-esqueleto" aria-hidden="true">
    @for (i of [1,2,3,4,5]; track i) {
      <div class="tarjeta-insumo-esqueleto">
        <div class="esqueleto esqueleto-en-tarjeta esqueleto-linea-nombre"></div>
        <div class="esqueleto esqueleto-en-tarjeta esqueleto-linea-dato"></div>
      </div>
    }
  </div>
} @else { ... }
```

---

## 8. Inputs / selects con foco

Patrón repetido en todos los `.panel-formulario`:
```css
.campo input, .campo select {
  width: 100%; box-sizing: border-box; min-height: 48px; padding: 0 12px;
  font-size: 1rem; border: 2px solid var(--pos-border); border-radius: var(--radio-sm);
  background: var(--pos-bg-main); color: var(--pos-text-primary);
}
.campo input:focus, .campo select:focus { outline: none; border-color: var(--acento-modulo); }
```
Más la regla global de foco con teclado (`:focus-visible`, distinta de `:focus`):
```css
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: none;
  border-color: var(--acento-foco) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acento-foco) 30%, transparent);
}
```
**Patrón `<option>` obligatorio en selects con valor precargado** (edición):
nunca usar `[value]` en el `<select>` — hay una condición de carrera real de
Angular (`[value]` se aplica antes de que existan los `<option>` generados por
`@for`, dejando el campo vacío o en la primera opción sin querer; bug real
encontrado y corregido en 7 formularios el 2026-10-17). Usar `[selected]` por
`<option>`:
```html
<select (change)="categoriaIdForm.set($any($event.target).value ? +$any($event.target).value : null)">
  <option [value]="null" [selected]="categoriaIdForm() === null">Sin categoría</option>
  @for (categoria of categorias(); track categoria.id) {
    <option [value]="categoria.id" [selected]="categoria.id === categoriaIdForm()">
      {{ categoria.nombre }}
    </option>
  }
</select>
```

**Campo de búsqueda con foco compensado** (`.campo-busqueda:focus-within` en
vez de solo quitar el `outline` del `<input>` — otro bug real de accesibilidad
ya corregido):
```css
.campo-busqueda { display: flex; align-items: center; gap: 8px; min-height: 44px;
  padding: 0 14px; border: 1px solid var(--pos-border); border-radius: var(--radio-pastilla);
  background: var(--pos-bg-card); color: var(--pos-text-secondary); }
.campo-busqueda input { flex: 1; border: none; background: transparent; color: var(--pos-text-primary); }
.campo-busqueda input:focus { outline: none; } /* el anillo real vive en :focus-within del envoltorio */
```
