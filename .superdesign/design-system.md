# CHUCHERIAS — design-system.md

## Producto
Sistema interno de gestión operativa para **Chucherías Mix**, un negocio real de
comida preparada (hamburguesas, pizzas, alitas/boneless, snacks, crepas/waffles,
bebidas preparadas) en Durango, México — abre 2:00pm–9:30pm, martes a domingo.
Lo usa el propio personal (titular, encargados, cajeros, auxiliares de cocina),
NUNCA el cliente final — no es una app de delivery ni un sitio de marketing.
Rol dominante de uso: tablet/teléfono de mostrador y laptop de oficina, sesiones
largas y repetidas durante el turno (POS, Comandas) o consultas puntuales de
gestión (Inventario, Nómina, Reportes).

**14 módulos reales** (ver `.superdesign/init/routes.md`): Login, Dashboard, POS,
Comandas, Caja, Ventas (historial), Usuarios, Inventario, Mermas, Asistencias,
Nómina, Ventas especiales, Recetario, Checklist, Clientes, Reportes.

JTBD por rol:
- **Cajero/auxiliar**: cobrar rápido, ver comandas, marcar checklist de apertura/cierre.
- **Encargado/administrador**: todo lo anterior + inventario, personal, reportes,
  nómina, clientes de lealtad — decisiones del día a día del negocio.

## Dirección visual de esta ronda
El sistema YA tiene una identidad propia validada (paleta café/crema cálida,
naranja de marca, tipografía Fraunces con ejes variables "juguetones", un color
por módulo) — no se trata de reemplazarla, sino de **aterrizarla más en el
negocio real**: el pedido explícito del usuario es sentir menos "panel SaaS
genérico" y más "Chucherías Mix de verdad" — el letrero de neón, el logotipo
multicolor hecho a mano, el menú físico con banners saturados, la calidez de un
negocio de comida preparada atendido por personas, no una corporación.
Explorar esto dentro de los tokens fijos (abajo), nunca inventando una paleta
nueva — el ejercicio es de COMPOSICIÓN/TEXTURA/CARÁCTER, no de color.

## Branding — tokens FIJOS (nunca inventar alternativas)

**Tema oscuro = default** (no claro). Café tostado casi negro, texto crema:
```
--pos-bg-main:#1d1511  --pos-bg-card:#2b2019  --pos-bg-sidebar:#251b15
--pos-border:#4a392e   --pos-text-primary:#fbf0e2  --pos-text-secondary:#d2bfac
--pos-text-muted:#ad9682
```
Tema claro (crema):
```
--pos-bg-main:#fdf6ec  --pos-bg-card:#fffbf5  --pos-bg-sidebar:#f7ecdc
--pos-border:#e6d6bf   --pos-text-primary:#2a1c12  --pos-text-secondary:#5c4a3b
--pos-text-muted:#7a6553
```
Acción/éxito/peligro (regla dura: el color crudo NUNCA es texto de párrafo, solo
sus variantes `-texto`, ya validadas AA 4.5:1):
```
--action-primary:#c2410c (único fondo de acción, solo en POS y "Seguir conectado")
--acento-texto: oscuro #ff9a62 / claro #b0380a
--exito-texto:  oscuro #6ee7a0 / claro #166534
--peligro-texto: oscuro #ff8f85 / claro #b91c1c
```
14 colores de identidad por módulo (`--mod-*`, uno por pantalla de gestión —
lista completa en `.superdesign/init/theme.md` Parte 1) — SOLO como relleno de
ícono/insignia/borde, nunca como texto de párrafo.

Tipografía (fija, con sus ejes variables activados):
```
--fuente-titulo: 'Fraunces', Georgia, serif  (h1/h2/h3, cifras de total)
  font-variation-settings: 'SOFT' 60, 'WONK' 1  ← remates suaves + alternas
  "chuecas" a propósito: es la pieza que más levanta "hecho a mano" sobre
  "plantilla genérica". Potenciar su presencia es parte de esta ronda.
--fuente-texto: 'DM Sans', system-ui, sans-serif  (todo lo demás)
font-variant-numeric: tabular-nums
```
Radios: `--radio-xs:8px --radio-sm:12px --radio-md:16px --radio-lg:22px --radio-pastilla:999px`.
Sombras: `--sombra-suave`, `--sombra-elevada`, `--sombra-acento` (tinte naranja).
Franja arcoíris fija (orden siempre igual): caja→comandas→ventas→recetario→mermas.
Íconos: sprite SVG inline (`<use href="#ic-nombre">`), trazo 2px, hereda color de texto — nunca una librería de iconos externa ni emoji.
12 colores `--cat-*` de categorías del menú real — ya validados AA + daltonismo, no tocar.

Logo real (Brand Asset, ya subido a este proyecto — usar SIEMPRE esta URL
pública exacta en el HTML generado, nunca iniciales/genérico/SVG inventado):
- **Color** (fondo claro/tarjetas/dashboard): asset key `chucherias-marca-logo-color` —
  `https://vgbujcuwptvheqijyjbe.supabase.co/storage/v1/object/public/hmac-uploads/projects/9eda39df-a714-407d-b83d-03e5462f3b90/brand-assets/chucherias-marca-logo-color/logo-color.png`
- **Letras blancas** (fondo oscuro de marca, ej. panel de login): asset key `chucherias-marca-logo-blanco` —
  `https://vgbujcuwptvheqijyjbe.supabase.co/storage/v1/object/public/hmac-uploads/projects/9eda39df-a714-407d-b83d-03e5462f3b90/brand-assets/chucherias-marca-logo-blanco/logo-blanco.png`

## Motion
Fade/translate suaves, nunca llamativos (`aparecer`, `subir`, `escalar`, `rebote` —
ver `theme.md`), respetan `prefers-reduced-motion`. Un solo `animation: aparecer
0.22s ease` por pantalla al navegar, no animaciones por elemento individual.

## Requisitos específicos de este ejercicio
- Mobile-first real: el personal usa tablet/teléfono en mostrador. Nunca un
  diseño que solo funcione en escritorio ancho.
- Nunca degradar el contraste AA ya validado (texto sobre fondo) para ganar "carácter".
- El carácter/calidez se gana con COMPOSICIÓN (texturas, iconografía más expresiva,
  mayor presencia de Fraunces/sus alternas, foto real de producto donde ya existe,
  acentos tipo "hecho a mano"), nunca inventando una paleta o tipografía nueva.
- Un rol de "home"/identidad central lo tiene el Dashboard — es el ancla de esta ronda.
