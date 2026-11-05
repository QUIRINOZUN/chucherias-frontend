// =============================================================================
// pos/categoria-estilos.ts — COLOR E ÍCONO DE CADA CATEGORÍA
// =============================================================================
// Traduce el NOMBRE de una categoría del menú a su color y su ícono, para
// pintar los chips de filtro y las tarjetas de producto del POS.
//
// DE DÓNDE SALE CADA COSA
//   1) Personalización real (2026-10-31): si la categoría tiene icono/color
//      capturados en la base (`categorias.icono`/`categorias.color`,
//      editable desde Recetario → Menú → Categorías), esos ganan siempre.
//      Se cargan vía aplicarEstilosPersonalizados(), que cada pantalla que
//      ya pide GET /api/categorias llama justo después de recibirlas (pos.ts,
//      recetario.ts, ventas-especiales.ts) — así este módulo no necesita
//      pedir nada por su cuenta.
//   2) Si no hay personalización, el color/ícono por defecto de abajo (los
//      12 colores están validados por contraste y por daltonismo — se
//      mantienen como el estilo "de fábrica", nunca se borran).
//
// REGLA DE ACCESIBILIDAD: el color nunca es el único identificador de una
// categoría; siempre va acompañado del ícono y del nombre visible. Un color
// personalizado por el administrador NO pasa por esa validación — queda
// bajo su criterio, a diferencia de la paleta por defecto.
//
// LAS CLAVES DEL MAPA POR DEFECTO DEBEN COINCIDIR EXACTO con el nombre de la
// categoría en la base de datos. Si aparece una categoría nueva sin entrada
// ahí NI personalización propia, se usa el estilo por defecto (gris con
// cubiertos) en vez de fallar.
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

// Personalización real por categoría (2026-10-31), poblada en tiempo de
// ejecución — ver aplicarEstilosPersonalizados() más abajo. Un Map module-
// level (no un signal/servicio) a propósito: es un simple caché de lectura
// que varias pantallas independientes alimentan con el mismo dato
// (GET /api/categorias), igual que ya hacía ESTILOS_POR_CATEGORIA como
// tabla estática — aquí solo se vuelve editable en tiempo de ejecución.
const ESTILOS_PERSONALIZADOS = new Map<string, EstiloCategoria>();

// Se llama justo después de cargar GET /api/categorias (pos.ts, recetario.ts,
// ventas-especiales.ts) para que esta tabla refleje la personalización real
// — una categoría sin icono/color capturados se QUITA del mapa (si antes
// tenía una personalización que se borró desde Recetario, vuelve al estilo
// por defecto de inmediato, sin esperar a recargar la página).
export function aplicarEstilosPersonalizados(
  categorias: { nombre: string; icono?: string | null; color?: string | null }[],
): void {
  for (const categoria of categorias) {
    if (categoria.icono && categoria.color) {
      ESTILOS_PERSONALIZADOS.set(categoria.nombre, {
        color: categoria.color,
        icono: categoria.icono,
      });
    } else {
      ESTILOS_PERSONALIZADOS.delete(categoria.nombre);
    }
  }
}

// Devuelve el estilo de una categoría por su nombre exacto: personalizado
// primero, si no el de fábrica, si no el neutro por defecto.
export function obtenerEstiloCategoria(nombreCategoria: string): EstiloCategoria {
  return (
    ESTILOS_PERSONALIZADOS.get(nombreCategoria) ??
    ESTILOS_POR_CATEGORIA[nombreCategoria] ??
    ESTILO_POR_DEFECTO
  );
}

// Íconos que se pueden elegir al personalizar una categoría (2026-10-31,
// Recetario → Menú → Categorías) — todo el sprite SVG de index.html MENOS
// los de pura navegación/acción de interfaz (volver, cerrar, flechas,
// buscar, tema claro/oscuro, check, "todas"), que no tendría sentido
// ofrecer como ícono temático de una categoría del menú.
export const ICONOS_DISPONIBLES: string[] = [
  // Comida y bebida primero (2026-11-04), el resto después.
  'taco',
  'hotdog',
  'sandwich',
  'carne',
  'pollo',
  'pescado',
  'sushi',
  'ensalada',
  'sopa',
  'pan',
  'queso',
  'palomitas',
  'galleta',
  'dona',
  'cupcake',
  'pastel',
  'helado',
  'paleta',
  'cafe',
  'refresco',
  'cerveza',
  'alitas',
  'billetes',
  'bitacora',
  'bolsa',
  'boneless',
  'botella',
  'calculadora',
  'calendario',
  'camara',
  'cocinar',
  'comanda',
  'corazon',
  'cubiertos',
  'elote',
  'fruta',
  'gastos',
  'grafica',
  'hamburguesa',
  'papas',
  'paquete',
  'picante',
  'pizza',
  'recibo',
  'regalo',
  'reloj',
  'sobre',
  'usuarios',
  'vaso',
  'waffle',
];
