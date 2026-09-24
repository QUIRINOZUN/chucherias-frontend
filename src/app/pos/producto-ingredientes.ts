// Ingredientes que el cliente puede pedir quitar, por nombre de producto.
// Solo se listan productos cuyo ingrediente real se conoce por el menú
// (men_chucher_as_mix.txt); el resto no ofrece el botón "Quitar" y usa
// únicamente el campo de indicaciones libres.
const INGREDIENTES_POR_PRODUCTO: Record<string, string[]> = {
  'Hamburguesa Tradicional': [
    'Tocino',
    'Queso amarillo',
    'Cebolla morada',
    'Tomate',
    'Lechuga',
    'Mayonesa',
    'Cátsup',
    'Chiles',
  ],
  'Hamburguesa BBQ': ['Aros de cebolla empanizados', 'Tocino', 'Mayonesa', 'Queso amarillo'],
  'Hamburguesa Buffalo': ['Aros de cebolla empanizados', 'Tocino', 'Mayonesa', 'Queso amarillo'],
  'Hamburguesa Mango Habanero': ['Aros de cebolla empanizados', 'Tocino', 'Mayonesa', 'Queso amarillo'],
  'Hamburguesa de Pollo': ['Queso amarillo', 'Cebolla morada', 'Lechuga', 'Tomate', 'Pepinillos', 'Aderezo ranch'],
  Alitas: ['Apio', 'Zanahoria', 'Aderezo ranch'],
  Boneless: ['Apio', 'Zanahoria', 'Aderezo ranch'],
  'Salchi-Papas': ['Cátsup', 'Mayonesa', 'Chiles curtidos'],
};

export function obtenerIngredientesRemovibles(nombreProducto: string): string[] {
  return INGREDIENTES_POR_PRODUCTO[nombreProducto] ?? [];
}
