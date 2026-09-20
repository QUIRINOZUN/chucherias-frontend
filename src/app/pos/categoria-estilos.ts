// Color e ícono por categoría real del catálogo. El color por sí solo nunca
// es la única forma de identificar una categoría: siempre va acompañado del
// ícono y del nombre visible (chip, insignia en la tarjeta de producto).
export interface EstiloCategoria {
  color: string;
  icono: string;
}

const ESTILOS_POR_CATEGORIA: Record<string, EstiloCategoria> = {
  Hamburguesas: { color: 'var(--cat-hamburguesas)', icono: '🍔' },
  Pizzas: { color: 'var(--cat-pizzas)', icono: '🍕' },
  'Alitas y Boneless': { color: 'var(--cat-alitas)', icono: '🍗' },
  'Snacks y Botanas': { color: 'var(--cat-snacks)', icono: '🥨' },
  'Crepas y Waffles': { color: 'var(--cat-crepas)', icono: '🧇' },
  'Bebidas Preparadas': { color: 'var(--cat-bebidas)', icono: '🥤' },
};

const ESTILO_POR_DEFECTO: EstiloCategoria = { color: 'var(--pos-text-muted)', icono: '🍽️' };

export function obtenerEstiloCategoria(nombreCategoria: string): EstiloCategoria {
  return ESTILOS_POR_CATEGORIA[nombreCategoria] ?? ESTILO_POR_DEFECTO;
}
