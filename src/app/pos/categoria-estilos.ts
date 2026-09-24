// Color e ícono por categoría real del catálogo. El color por sí solo nunca
// es la única forma de identificar una categoría: siempre va acompañado del
// ícono y del nombre visible (chip, insignia en la tarjeta de producto).
export interface EstiloCategoria {
  color: string;
  icono: string;
}

const ESTILOS_POR_CATEGORIA: Record<string, EstiloCategoria> = {
  // Familia "Comida principal" (naranjas)
  Hamburguesas: { color: 'var(--cat-hamburguesas)', icono: '🍔' },
  Pizzas: { color: 'var(--cat-pizzas)', icono: '🍕' },
  Alitas: { color: 'var(--cat-alitas)', icono: '🍗' },
  Boneless: { color: 'var(--cat-boneless)', icono: '🍖' },

  // Familia "Salados y botanas" (verdes)
  'Papas y Entradas': { color: 'var(--cat-papas)', icono: '🍟' },
  'Snacks y Clamatos': { color: 'var(--cat-snacks)', icono: '🌶️' },
  'Tostitos y Elotes': { color: 'var(--cat-tostitos)', icono: '🌽' },
  'Botanas de Sobre': { color: 'var(--cat-botanas-sobre)', icono: '🍿' },

  // Familia "Dulces" (rosas/morados)
  'Frutas Locas': { color: 'var(--cat-frutas-locas)', icono: '🍓' },
  'Crepas y Waffles': { color: 'var(--cat-crepas)', icono: '🧇' },

  // Familia "Bebidas" (azules)
  'Bebidas Preparadas': { color: 'var(--cat-bebidas-preparadas)', icono: '🥤' },
  'Bebidas Embotelladas': { color: 'var(--cat-bebidas-embotelladas)', icono: '🧃' },
};

const ESTILO_POR_DEFECTO: EstiloCategoria = { color: 'var(--pos-text-muted)', icono: '🍽️' };

export function obtenerEstiloCategoria(nombreCategoria: string): EstiloCategoria {
  return ESTILOS_POR_CATEGORIA[nombreCategoria] ?? ESTILO_POR_DEFECTO;
}
