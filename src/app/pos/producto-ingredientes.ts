// =============================================================================
// pos/producto-ingredientes.ts — INGREDIENTES QUE SE PUEDEN QUITAR (RF-01)
// =============================================================================
// Alimenta el botón "Quitar" del carrito del POS: al tocarlo se despliega una
// lista de casillas con los ingredientes de ESE producto. Lo que el cajero
// marca viaja al servidor de DOS formas:
//   - Dentro de `notas` (texto libre, "Sin: tocino, cebolla") — para que
//     cualquier persona lo lea de un vistazo en el comprobante o la comanda.
//   - Como `insumo` estructurado (Fase 2 del recetario) — para que al
//     registrar la venta el servidor sepa EXACTAMENTE qué insumo no debe
//     descontar del inventario cuando la comanda pase a "preparando".
//
// `display` es lo que ve el cajero/cliente (texto corto y natural).
// `insumo` es el nombre EXACTO como está dado de alta en la tabla `insumos`
// (ver chucherias-backend/scripts/seed-insumos.js) — deben coincidir letra
// por letra, o el servidor no podrá encontrar el insumo y lo ignorará.
//
// PARA AGREGAR UN PRODUCTO: añade una línea al mapa con el nombre EXACTO del
// producto (como aparece en el menú) y la lista de sus ingredientes. Los
// productos que no estén aquí simplemente no muestran el botón "Quitar" y solo
// usan el campo de indicaciones libres.
//
// Cada insumo listado aquí se verificó contra scripts/seed-recetas.js (la
// receta real ya cargada en Neon) para que "quitar X" de verdad corresponda
// a un renglón de esa receta — si no coincidiera letra por letra con
// `insumos.nombre`, el servidor lo ignoraría en silencio y el insumo
// seguiría descontándose como si nadie lo hubiera quitado.
//
// LIMITACIÓN CONOCIDA: "Combo Hamburguesa" no tiene entrada propia. Su receta
// es "la hamburguesa elegida + papas + refresco" (el sabor de hamburguesa es
// la VARIANTE del combo, ej. "BBQ"), pero este mapa solo distingue por nombre
// de PRODUCTO, no por variante — no hay forma de saber aquí cuál hamburguesa
// se eligió dentro del combo. Si se quiere personalizar el combo igual que su
// hamburguesa suelta, hay que extender `obtenerIngredientesRemovibles` para
// que reciba también el nombre de la variante.
// =============================================================================

// Un ingrediente que se puede quitar de una línea del carrito.
export interface IngredienteRemovible {
  // Texto que ve el cajero/cliente (chip, checklist, comprobante).
  display: string;
  // Nombre EXACTO del insumo en la tabla `insumos` (chucherias-backend).
  insumo: string;
}

// Ingredientes que el cliente puede pedir quitar, por nombre de producto.
// Solo se listan productos cuyo ingrediente real se conoce por el menú
// (men_chucher_as_mix.txt); el resto no ofrece el botón "Quitar" y usa
// únicamente el campo de indicaciones libres.
const INGREDIENTES_POR_PRODUCTO: Record<string, IngredienteRemovible[]> = {
  'Hamburguesa Tradicional': [
    { display: 'Tocino', insumo: 'Tocino' },
    { display: 'Queso amarillo', insumo: 'Queso amarillo' },
    { display: 'Cebolla morada', insumo: 'Cebolla morada (fileteada)' },
    { display: 'Tomate', insumo: 'Jitomate (rodajas)' },
    { display: 'Lechuga', insumo: 'Lechuga' },
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Cátsup', insumo: 'Salsa cátsup' },
    { display: 'Chiles', insumo: 'Chiles en escabeche' },
  ],
  'Hamburguesa BBQ': [
    { display: 'Aros de cebolla empanizados', insumo: 'Aros de cebolla empanizados' },
    { display: 'Tocino', insumo: 'Tocino' },
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Queso amarillo', insumo: 'Queso amarillo' },
  ],
  'Hamburguesa Buffalo': [
    { display: 'Aros de cebolla empanizados', insumo: 'Aros de cebolla empanizados' },
    { display: 'Tocino', insumo: 'Tocino' },
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Queso amarillo', insumo: 'Queso amarillo' },
  ],
  'Hamburguesa Mango Habanero': [
    { display: 'Aros de cebolla empanizados', insumo: 'Aros de cebolla empanizados' },
    { display: 'Tocino', insumo: 'Tocino' },
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Queso amarillo', insumo: 'Queso amarillo' },
  ],
  'Hamburguesa de Pollo': [
    { display: 'Queso amarillo', insumo: 'Queso amarillo' },
    { display: 'Cebolla morada', insumo: 'Cebolla morada (fileteada)' },
    { display: 'Lechuga', insumo: 'Lechuga' },
    { display: 'Tomate', insumo: 'Jitomate (rodajas)' },
    { display: 'Pepinillos', insumo: 'Pepinillos' },
    { display: 'Aderezo ranch', insumo: 'Aderezo ranch' },
  ],
  Alitas: [
    { display: 'Apio', insumo: 'Apio (bastones)' },
    { display: 'Zanahoria', insumo: 'Zanahoria (bastones)' },
    { display: 'Aderezo ranch', insumo: 'Aderezo ranch' },
  ],
  Boneless: [
    { display: 'Apio', insumo: 'Apio (bastones)' },
    { display: 'Zanahoria', insumo: 'Zanahoria (bastones)' },
    { display: 'Aderezo ranch', insumo: 'Aderezo ranch' },
  ],
  'Salchi-Papas': [
    { display: 'Cátsup', insumo: 'Salsa cátsup' },
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Chiles curtidos', insumo: 'Chiles curtidos' },
  ],

  // ---- Pizzas individuales ----
  'Pizza Pepperoni': [{ display: 'Pepperoni', insumo: 'Pepperoni' }],
  'Pizza Mexicana': [
    { display: 'Pepperoni', insumo: 'Pepperoni' },
    { display: 'Chile jalapeño', insumo: 'Chile jalapeño (rodajas)' },
    { display: 'Tocino', insumo: 'Tocino' },
  ],
  'Pizza Hawaiana': [
    { display: 'Tocino', insumo: 'Tocino' },
    { display: 'Piña', insumo: 'Piña en trozos (enlatada)' },
    { display: 'Cereza en almíbar', insumo: 'Cereza en almíbar' },
  ],

  // ---- Papas y entradas calientes ----
  Nachos: [
    { display: 'Queso fundido', insumo: 'Queso amarillo' },
    { display: 'Jalapeños', insumo: 'Chile jalapeño (rodajas)' },
  ],

  // ---- Snacks y clamatos ----
  Pepihuates: [
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Salsa picante', insumo: 'Salsa picante' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  Picamix: [{ display: 'Chamoy', insumo: 'Chamoy' }],
  'Pichachitos Preparados': [
    { display: 'Salsa picante', insumo: 'Salsa picante' },
    { display: 'Chamoy', insumo: 'Chamoy' },
  ],
  'Papas Locas': [
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Salsa picante', insumo: 'Salsa picante' },
  ],
  'Miche-Papas': [
    { display: 'Salsa picante', insumo: 'Salsa picante' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  'Clamato Preparado': [
    { display: 'Salsa picante', insumo: 'Salsa picante' },
    { display: 'Chamoy', insumo: 'Chamoy' },
  ],

  // ---- Tostitos, elotes y botanas preparadas ----
  'Tostitos Preparados': [
    { display: 'Salsa picante', insumo: 'Salsa picante' },
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  'Tostitos con Camarón': [
    { display: 'Cebolla', insumo: 'Cebolla picada' },
    { display: 'Cilantro', insumo: 'Cilantro picado' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  'Tostiti-Elote': [
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Queso cotija', insumo: 'Queso cotija/parmesano' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  Esquite: [
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Queso cotija', insumo: 'Queso cotija/parmesano' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  // 2026-10-08: tenía Mayonesa/Queso cotija/Salsa picante — eran los
  // ingredientes de una receta vieja que no correspondía a este platillo
  // (ver corrección de receta_insumos, variante 58, en CLAUDE.md). La
  // receta real son cheetos flamin hot, doritos dinamita, elote y queso
  // amarillo (bañado) — se corrige el checklist para que coincida.
  'Elote Hot': [
    { display: 'Cheetos flamin hot', insumo: 'Cheetos Flamin Hot (sobre)' },
    { display: 'Doritos dinamita', insumo: 'Doritos Dinamita (sobre)' },
    { display: 'Queso amarillo', insumo: 'Queso amarillo' },
  ],
  'Chuchi-Elote': [
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Queso cotija', insumo: 'Queso cotija/parmesano' },
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  // 2026-10-08: tenía "Tocino" en la lista, pero la receta real cargada
  // (variante 60) nunca lo incluyó — no era un ingrediente de este
  // platillo, se quita del checklist. Se agregan "Mantequilla" y "Queso
  // rallado", que sí se agregaron a la receta real en esta misma fecha
  // (el menú los menciona y no estaban cargados).
  'Elote Chorreado': [
    { display: 'Queso fundido', insumo: 'Queso amarillo' },
    { display: 'Mayonesa', insumo: 'Mayonesa' },
    { display: 'Mantequilla', insumo: 'Mantequilla' },
    { display: 'Queso rallado', insumo: 'Queso cotija/parmesano' },
  ],

  // ---- Frutas locas y especiales ----
  // 2026-10-08: tenía "Dulce enchilado" en la lista — era el ingrediente
  // de una receta vieja que no correspondía a este platillo (ver
  // corrección de receta_insumos, variante 61: ahora cacahuate/gomitas
  // son elección, no un ingrediente fijo que se pueda "quitar").
  'Manzana Loca': [
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],
  'Piña Loca': [
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
    { display: 'Dulce enchilado', insumo: 'Dulce enchilado' },
  ],
  'Tacos Locos': [
    { display: 'Chamoy', insumo: 'Chamoy' },
    { display: 'Chile en polvo', insumo: 'Chile en polvo/piquín' },
  ],

  // ---- Malteadas y frappés ----
  // El sabor (Fresa/Vainilla/Oreo/Chocolate, Regular/Moka/Vainilla/Caramelo) ya
  // es la VARIANTE elegida en el POS, no algo que se "quite" aquí — solo la
  // crema batida final es un extra realmente opcional.
  Malteada: [{ display: 'Crema batida', insumo: 'Crema batida' }],
  Frappé: [{ display: 'Crema batida', insumo: 'Crema batida' }],
};

// "Combo Hamburguesa" es un caso especial: su receta real es "la hamburguesa
// elegida + papas + refresco" (ver scripts/seed-recetas.js, recetas 21-25:
// son los MISMOS insumos que la hamburguesa suelta, solo que duplicados
// dentro de la receta del combo porque el esquema no modela herencia entre
// recetas). El sabor de hamburguesa es la VARIANTE del combo (ej. "BBQ"), no
// el producto — así que aquí sí hace falta distinguir por variante, no solo
// por producto. Se indexa por "Producto::Variante" y `obtenerIngredientesRemovibles`
// lo consulta primero, antes de caer al mapa por producto de arriba.
const INGREDIENTES_POR_PRODUCTO_Y_VARIANTE: Record<string, IngredienteRemovible[]> = {
  'Combo Hamburguesa::Tradicional': INGREDIENTES_POR_PRODUCTO['Hamburguesa Tradicional'],
  'Combo Hamburguesa::BBQ': INGREDIENTES_POR_PRODUCTO['Hamburguesa BBQ'],
  'Combo Hamburguesa::Buffalo': INGREDIENTES_POR_PRODUCTO['Hamburguesa Buffalo'],
  'Combo Hamburguesa::Mango Habanero': INGREDIENTES_POR_PRODUCTO['Hamburguesa Mango Habanero'],
  'Combo Hamburguesa::Pollo': INGREDIENTES_POR_PRODUCTO['Hamburguesa de Pollo'],
};

// Devuelve los ingredientes removibles de una línea del carrito, o una lista
// vacía si no tiene (en cuyo caso el POS oculta el botón "Quitar"). Primero
// intenta por producto+variante (para los casos como "Combo Hamburguesa"
// donde el mismo producto tiene recetas distintas según la variante elegida)
// y, si no hay nada ahí, cae al mapa genérico por producto — que cubre el
// resto del menú, donde todas las variantes de un producto comparten los
// mismos ingredientes removibles (ej. los 5 paquetes de Alitas).
export function obtenerIngredientesRemovibles(
  nombreProducto: string,
  nombreVariante?: string,
): IngredienteRemovible[] {
  if (nombreVariante) {
    const porVariante =
      INGREDIENTES_POR_PRODUCTO_Y_VARIANTE[`${nombreProducto}::${nombreVariante}`];
    if (porVariante) {
      return porVariante;
    }
  }
  return INGREDIENTES_POR_PRODUCTO[nombreProducto] ?? [];
}
