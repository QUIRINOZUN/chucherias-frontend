// =============================================================================
// pos/producto-ingredientes.ts — INGREDIENTES QUE SE PUEDEN QUITAR (RF-01)
// =============================================================================
// Alimenta el botón "Quitar" del carrito del POS: al tocarlo se despliega una
// lista de casillas con los ingredientes de ESE producto. Lo que el cajero
// marca viaja al servidor dentro de las notas de la venta ("Sin: tocino, ...").
//
// PARA AGREGAR UN PRODUCTO: añade una línea al mapa con el nombre EXACTO del
// producto (como aparece en el menú) y la lista de sus ingredientes. Los
// productos que no estén aquí simplemente no muestran el botón "Quitar" y solo
// usan el campo de indicaciones libres.
//
// Es un mapa en código (no una tabla) porque el recetario formal aún no existe
// en la base de datos; cuando se construya, esta lista debería salir de ahí.
// =============================================================================

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

// Devuelve los ingredientes removibles de un producto, o una lista vacía si no
// tiene (en cuyo caso el POS oculta el botón "Quitar").
export function obtenerIngredientesRemovibles(nombreProducto: string): string[] {
  return INGREDIENTES_POR_PRODUCTO[nombreProducto] ?? [];
}
