# CHUCHERIAS — extractable-components.md

Menú de patrones que podrían promoverse a componentes/partials reales de
Superdesign. Ninguno existe hoy como un componente Angular compartido — cada
uno vive copiado por módulo (ver `components.md` para el CSS fuente real).
"Props" aquí significa "lo que cambiaría de una página a otra" si esto se
extrajera; "hardcoded" es lo que es igual en todas partes.

---

### 1. Encabezado de pantalla — **layout**
Fuente: `styles.css` (reglas globales) + cada `<modulo>.html` (markup repetido).
- **Props por página**: `--acento-modulo` (color, vía `:host`), texto del
  `<h1>`, nombre del ícono (`#ic-xxx` en `.insignia-pantalla`), ruta de
  "Volver" (siempre `/dashboard` en la práctica).
- **Hardcoded**: estructura de 4 elementos (volver → insignia → h1 → tema),
  franja arcoíris de 5px (SIEMPRE los mismos 5 colores en el mismo orden,
  nunca cambia por módulo), textura de puntos + raya de acento de 4px abajo,
  línea de 2 máximo con elipsis del título, botón de tema sol/luna idéntico
  en las 15 pantallas.
- Excepción: el dashboard usa un layout de header distinto (logo + saludo, sin
  insignia ni `--acento-modulo`).

### 2. Tarjeta de módulo del dashboard — **layout/basic**
Fuente: `dashboard.html`/`dashboard.css`.
- **Props por tarjeta**: ruta, título, descripción, ícono, `colorVar`
  (`--mod-*`), posición en la rejilla (determina si cae en columna
  izquierda/centro/derecha — ver el tratamiento asimétrico por `nth-child(3n±)`).
- **Hardcoded**: esquina inferior-izquierda sin redondear, borde izquierdo de
  4px, animación de entrada escalonada por posición (`animation-delay`
  incremental hasta 12 tarjetas), hover que gira+escala el ícono 6°/1.06, el
  badge rojo de alerta (solo usado hoy por Recetario).
- 3 variantes de layout según columna (640px+): izquierda = ícono grande a la
  izquierda en fila; centro = todo centrado; derecha = fila invertida, ícono
  aún más grande, sombra de acento PERMANENTE (no solo hover).

### 3. Franja arcoíris — **basic**
Fuente: `--franja-arcoiris` (`styles.css`) + `::before` de 5px en cada header
y en `.login-marca`.
- **Props**: ninguna — es intencionalmente IDÉNTICA en toda la app (mismo
  degradado, mismo orden: caja → comandas → ventas → recetario → mermas).
- **Hardcoded**: todo. Es un elemento de marca consistente, no configurable
  por página.

### 4. Insignia circular de ícono — **basic**
Fuente: `.insignia-pantalla` (headers) / `.modulo-icono` (tarjetas dashboard) —
dos clases distintas, mismo concepto visual (sello circular + halo tenue).
- **Props**: color (`--acento-modulo`), ícono (`#ic-xxx`), tamaño (38px en
  header, 52-76px en tarjetas según columna).
- **Hardcoded**: `border-radius: 50%`, el halo como `box-shadow` con
  `color-mix` al 12-22% de opacidad, nunca lleva texto adentro.

### 5. Botón primario por color de módulo — **basic**
Fuente: `.boton-nuevo-insumo` / `.boton-confirmar` / variantes equivalentes
por módulo.
- **Props**: color de fondo (`--acento-modulo`, salvo dentro del POS donde es
  `--action-primary`), texto del botón, ancho (full-width en formularios
  "nuevo X", `flex: 1` o `flex: 2` dentro de pares cancelar/confirmar).
- **Hardcoded**: `min-height: 52-56px` (regla táctil de 44px+), `color: #fff`,
  `box-shadow: var(--sombra-acento)`, hover = oscurecer con `color-mix(...85%, black)`,
  active = `scale(0.98)`, disabled = `opacity: 0.6` sin sombra.

### 6. Chip/pastilla de filtro — **basic**
Fuente: `.chip-categoria` (`inventario.css`), reutilizado con nombre propio en
Mermas/Ventas/Reportes/Asistencias.
- **Props**: texto, conteo (`.chip-conteo`), estado activo (bool), color al
  activarse — normalmente `--acento-modulo`, PERO si el chip representa un
  estado con significado funcional propio (nivel de stock, estado de
  venta/cotización) usa `--peligro-texto`/`--acento-texto`/`--exito-texto` en
  su lugar, nunca el color de módulo.
- **Hardcoded**: `border-radius: var(--radio-pastilla)`, `min-height: 40px`,
  fila con scroll horizontal + degradado de "hay más" en móvil.

### 7. Ventana modal con foco atrapado — **layout**
Fuente: `.overlay` + panel (2 geometrías reales — centrada vs. hoja deslizable,
ver `components.md` §5) + directiva `appFocoDialogo` (`core/foco-dialogo.ts`).
- **Props**: contenido interno (formulario/confirmación/detalle), ancho máximo
  del panel, geometría (centrada con `escalar` vs. hoja con `subir`), si cierra
  al tocar el fondo (formularios NO cierran así, confirmaciones de solo-lectura SÍ).
- **Hardcoded**: `role="dialog" aria-modal="true"` + `appFocoDialogo` +
  `(cerrarConEscape)` SIEMPRE en el panel (nunca en `.overlay`); borde/raya
  superior con `--acento-modulo`; `z-index` 20 (la mayoría) o 40 (POS, por
  convivir con el FAB "Ver carrito" y la hoja del carrito).

### 8. Skeleton de carga — **basic**
Fuente: `.esqueleto`/`.esqueleto-en-tarjeta` (`styles.css`) + forma compuesta
por módulo (ej. `.tarjeta-insumo-esqueleto`).
- **Props**: dimensiones de cada barra fantasma (ancho/alto, para imitar la
  forma real del contenido que va a cargar — nombre, cifra, imagen, etc.),
  cantidad de filas repetidas (`@for (i of [1,2,3,4,5])`).
- **Hardcoded**: el shimmer (`brillo-esqueleto`, 1.6s, respeta
  `prefers-reduced-motion`), el color base (`--pos-bg-card` o translúcido
  sobre `--pos-text-primary` 12% si ya está dentro de una tarjeta).

### 9. Barra de pestañas — **basic**
Fuente: `.tabs-caja`/`.tab-caja` (y análogos `-reportes`/`-asistencias`/`-recetario`).
- **Props**: lista de pestañas (ícono + texto + id), cuál está activa, color
  de activa (`--acento-modulo`).
- **Hardcoded**: `min-height: 44px` por pestaña, scroll horizontal con
  degradado de desvanecido cuando no caben todas, `border-radius: var(--radio-pastilla)`,
  transición de fundido (`aparecer 0.2s`) al cambiar de contenido — nunca
  vuelve a pedir datos al servidor al cambiar de pestaña (todo ya está cargado).

---

## Nota para quien use esto en Superdesign
Ningún patrón de arriba es importable como componente — todos requieren
copiar el bloque CSS correspondiente dentro del `<style>`/archivo del nuevo
diseño y repetir el markup. Si se diseñan pantallas nuevas para este sistema,
lo más fiel es: (a) fijar `--acento-modulo` a un `--mod-*` existente o a uno
nuevo siguiendo la fórmula de hue descrita en `theme.md`, (b) reutilizar
`.insignia-pantalla`/franja arcoíris/textura de puntos del header tal cual
(son reglas globales, ya "vienen gratis" con esas clases), y (c) copiar el
esqueleto de tarjeta/botón/chip de la sección de `components.md` más cercana
al dominio de la pantalla nueva.
