// Color e ícono por categoría real del catálogo. El color por sí solo nunca
// es la única forma de identificar una categoría: siempre va acompañado del
// ícono y del nombre visible (chip, insignia en la tarjeta de producto).
export interface EstiloCategoria {
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

const ESTILO_POR_DEFECTO: EstiloCategoria = { color: 'var(--pos-text-muted)', icono: 'cubiertos' };

export function obtenerEstiloCategoria(nombreCategoria: string): EstiloCategoria {
  return ESTILOS_POR_CATEGORIA[nombreCategoria] ?? ESTILO_POR_DEFECTO;
}
