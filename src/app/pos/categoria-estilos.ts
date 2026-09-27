// =============================================================================
// pos/categoria-estilos.ts — COLOR E ÍCONO DE CADA CATEGORÍA
// =============================================================================
// Traduce el NOMBRE de una categoría del menú a su color y su ícono, para
// pintar los chips de filtro y las tarjetas de producto del POS.
//
// DE DÓNDE SALE CADA COSA
//   color → una variable CSS --cat-* definida en styles.css (los 12 colores
//           están validados por contraste y por daltonismo; no se cambian).
//   icono → el nombre de un símbolo del sprite SVG de index.html (id
//           "ic-<nombre>").
//
// REGLA DE ACCESIBILIDAD: el color nunca es el único identificador de una
// categoría; siempre va acompañado del ícono y del nombre visible.
//
// LAS CLAVES DEBEN COINCIDIR EXACTO con el nombre de la categoría en la base de
// datos. Si aparece una categoría nueva sin entrada aquí, se usa el estilo por
// defecto (gris con cubiertos) en vez de fallar.
// =============================================================================

// Color e ícono por categoría real del catálogo. El color por sí solo nunca
// es la única forma de identificar una categoría: siempre va acompañado del
// ícono y del nombre visible (chip, insignia en la tarjeta de producto).
export interface EstiloCategoria {
  // Expresión CSS lista para usar, ej. 'var(--cat-pizzas)'.
  color: string;
  // Nombre del ícono del sprite SVG de index.html (id "ic-<icono>").
  icono: string;
}

const ESTILOS_POR_CATEGORIA: Record<string, EstiloCategoria> = {
  // Familia "Comida principal" (naranjas)
  Hamburguesas: { color: 'var(--cat-hamburguesas)', icono: 'hamburguesa' },
  Pizzas: { color: 'var(--cat-pizzas)', icono: 'pizza' },
  Alitas: { color: 'var(--cat-alitas)', icono: 'alitas' },
  Boneless: { color: 'var(--cat-boneless)', icono: 'boneless' },

  // Familia "Salados y botanas" (verdes)
  'Papas y Entradas': { color: 'var(--cat-papas)', icono: 'papas' },
  'Snacks y Clamatos': { color: 'var(--cat-snacks)', icono: 'picante' },
  'Tostitos y Elotes': { color: 'var(--cat-tostitos)', icono: 'elote' },
  'Botanas de Sobre': { color: 'var(--cat-botanas-sobre)', icono: 'sobre' },

  // Familia "Dulces" (rosas/morados)
  'Frutas Locas': { color: 'var(--cat-frutas-locas)', icono: 'fruta' },
  'Crepas y Waffles': { color: 'var(--cat-crepas)', icono: 'waffle' },

  // Familia "Bebidas" (azules)
  'Bebidas Preparadas': { color: 'var(--cat-bebidas-preparadas)', icono: 'vaso' },
  'Bebidas Embotelladas': { color: 'var(--cat-bebidas-embotelladas)', icono: 'botella' },
};

// Estilo neutro para cualquier categoría que todavía no tenga entrada arriba.
const ESTILO_POR_DEFECTO: EstiloCategoria = { color: 'var(--pos-text-muted)', icono: 'cubiertos' };

// Devuelve el estilo de una categoría por su nombre exacto.
export function obtenerEstiloCategoria(nombreCategoria: string): EstiloCategoria {
  return ESTILOS_POR_CATEGORIA[nombreCategoria] ?? ESTILO_POR_DEFECTO;
}
