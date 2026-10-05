// =============================================================================
// pos/producto-elecciones.ts — SABOR / SALSA / TOPPING A ELECCIÓN (RF-01,
// Fase 2 del recetario)
// =============================================================================
// Complementa a producto-ingredientes.ts (que sirve para QUITAR ingredientes
// fijos). Este archivo es para lo contrario: productos donde el cliente ELIGE
// uno (o varios) de una lista — salsa de alitas/boneless, topping de crepas y
// waffles, el dip de unas papas, etc. Esa elección hoy solo vive como texto
// libre en `notas`; con esto además queda estructurada, así el servidor sabe
// EXACTAMENTE qué insumo descontar del inventario (en vez de la línea de
// receta que se dejó fuera a propósito en scripts/seed-recetas.js).
//
// Se indexa por VARIANTE (no por producto, como en producto-ingredientes.ts)
// porque la CANTIDAD del insumo elegido cambia según el tamaño del paquete
// (ej. la salsa de Alitas Paquete #1 son 40 ml; la del Paquete #4 son 180 ml).
//
// `insumo` en cada opción es el nombre EXACTO como está en la tabla `insumos`
// (chucherias-backend/scripts/seed-insumos.js) — debe coincidir letra por
// letra o el servidor no encontrará el insumo.
// =============================================================================

// Una opción dentro de un grupo de elección (ej. "Buffalo" dentro de "Salsa").
export interface OpcionEleccion {
  display: string;
  insumo: string;
  cantidad: number;
  unidad: string;
}

// Un grupo de elección de un producto (ej. "Salsa", "Topping", "Dip"). Un
// producto puede tener más de un grupo (Tornado: dip Y sazonador).
export interface GrupoEleccion {
  // Texto que ve el cajero ("Salsa", "Topping (elige 1)", "Topping (elige 3)").
  etiqueta: string;
  // Cuántas opciones de ESTE grupo debe elegir el cliente (casi siempre 1;
  // las crepas/waffles "especiales" son 3).
  seleccionesPermitidas: number;
  opciones: OpcionEleccion[];
}

// ---- Listas de opciones reutilizadas por varios productos --------------

// Salsas de Alitas y Boneless (mismo menú de sabores para ambos).
const SALSAS_ALITAS_BONELESS: Omit<OpcionEleccion, 'cantidad' | 'unidad'>[] = [
  { display: 'Buffalo', insumo: 'Salsa Buffalo (alitas/boneless)' },
  { display: 'Mango Habanero', insumo: 'Salsa Mango Habanero (alitas/boneless)' },
  { display: 'BBQ Habanero', insumo: 'Salsa BBQ Habanero' },
  { display: 'Parmesano', insumo: 'Salsa Parmesano (alitas/boneless)' },
  { display: 'BBQ Clásica', insumo: 'Salsa BBQ Clásica' },
  { display: 'BBQ Chipotle', insumo: 'Salsa BBQ Chipotle' },
  { display: 'Lemon Pepper', insumo: 'Salsa Lemon Pepper' },
  { display: 'BBQ Miel', insumo: 'Salsa BBQ Miel' },
  { display: 'Buffalo Hot', insumo: 'Salsa Buffalo Hot' },
];

// Arma el grupo "Salsa" para una variante de alitas/boneless con SU cantidad
// (cada paquete lleva una cantidad de salsa distinta).
function grupoSalsa(cantidad: number): GrupoEleccion {
  return {
    etiqueta: 'Salsa',
    seleccionesPermitidas: 1,
    opciones: SALSAS_ALITAS_BONELESS.map((s) => ({ ...s, cantidad, unidad: 'ml' })),
  };
}

// Toppings de crepas y waffles (mismo menú para ambos).
const TOPPINGS_CREPAS_WAFFLES: Omit<OpcionEleccion, 'cantidad' | 'unidad'>[] = [
  { display: 'Cajeta', insumo: 'Cajeta' },
  { display: 'Lechera', insumo: 'Leche condensada (Lechera)' },
  { display: "Hershey's", insumo: "Hershey's (jarabe de chocolate)" },
  { display: 'Mapple', insumo: 'Miel maple' },
  { display: 'Coco', insumo: 'Coco rallado' },
  { display: 'Almendra', insumo: 'Almendra' },
  { display: 'Chispas de chocolate', insumo: 'Chispas de chocolate' },
  { display: 'Fresa', insumo: 'Fresa' },
  { display: 'Plátano', insumo: 'Plátano' },
  { display: 'Cereza', insumo: 'Cereza en almíbar' },
  { display: 'Durazno', insumo: 'Durazno (en almíbar)' },
  { display: 'Nuez', insumo: 'Nuez' },
  { display: 'Mermelada de zarzamora', insumo: 'Mermelada de zarzamora' },
  { display: 'Mermelada de fresa', insumo: 'Mermelada de fresa' },
  { display: 'Mermelada de piña', insumo: 'Mermelada de piña' },
  { display: 'Nutella', insumo: 'Nutella' },
  { display: 'Philadelphia', insumo: 'Queso crema Philadelphia' },
  { display: 'Azúcar glass', insumo: 'Azúcar glass' },
  { display: 'Galleta Oreo', insumo: 'Galleta Oreo molida' },
  { display: 'Mazapán', insumo: 'Mazapán' },
  { display: 'Chispas de colores', insumo: 'Chispas de colores' },
  { display: 'Lunetas', insumo: 'Lunetas' },
];

function grupoTopping(seleccionesPermitidas: number, cantidadCadaUno: number): GrupoEleccion {
  return {
    etiqueta: seleccionesPermitidas === 1 ? 'Topping' : `Toppings (elige ${seleccionesPermitidas})`,
    seleccionesPermitidas,
    opciones: TOPPINGS_CREPAS_WAFFLES.map((t) => ({ ...t, cantidad: cantidadCadaUno, unidad: 'g' })),
  };
}

// Dip de ranch o cátsup (Dedos de Queso, Aros de Cebolla).
function grupoDipRanchCatsup(cantidad: number): GrupoEleccion {
  return {
    etiqueta: 'Dip',
    seleccionesPermitidas: 1,
    opciones: [
      { display: 'Aderezo ranch', insumo: 'Aderezo ranch', cantidad, unidad: 'g' },
      { display: 'Salsa cátsup', insumo: 'Salsa cátsup', cantidad, unidad: 'g' },
    ],
  };
}

// ---- Mapa por variante ---------------------------------------------------
// Las cantidades salen de recetario_insumos_por_platillo.txt (mismo borrador
// usado en scripts/seed-recetas.js) — sin validar por Ximena todavía.
const ELECCIONES_POR_VARIANTE: Record<number, GrupoEleccion[]> = {
  // Alitas
  31: [grupoSalsa(60)], // 12 piezas
  32: [grupoSalsa(40)], // Paquete #1
  33: [grupoSalsa(60)], // Paquete #2
  34: [grupoSalsa(120)], // Paquete #3
  35: [grupoSalsa(180)], // Paquete #4

  // Boneless
  36: [grupoSalsa(60)], // 250 g solo
  37: [grupoSalsa(40)], // Paquete #1
  38: [grupoSalsa(60)], // Paquete #2
  39: [grupoSalsa(60)], // Paquete #3

  // Papas a la Francesa: 1 ingrediente gratis (cantidad distinta por opción).
  40: [
    {
      etiqueta: 'Ingrediente gratis',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Cátsup', insumo: 'Salsa cátsup', cantidad: 15, unidad: 'g' },
        { display: 'Queso parmesano', insumo: 'Queso cotija/parmesano', cantidad: 10, unidad: 'g' },
        { display: 'Queso amarillo', insumo: 'Queso amarillo', cantidad: 20, unidad: 'g' },
        { display: 'Aderezo ranch', insumo: 'Aderezo ranch', cantidad: 20, unidad: 'g' },
        { display: 'Tocino', insumo: 'Tocino', cantidad: 15, unidad: 'g' },
      ],
    },
  ],
  // Papas en Gajo: mismo tipo de elección, otras opciones/cantidades.
  41: [
    {
      etiqueta: 'Ingrediente',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Aderezo ranch', insumo: 'Aderezo ranch', cantidad: 20, unidad: 'g' },
        { display: 'Queso amarillo', insumo: 'Queso amarillo', cantidad: 20, unidad: 'g' },
        { display: 'Queso parmesano', insumo: 'Queso cotija/parmesano', cantidad: 15, unidad: 'g' },
      ],
    },
  ],

  // Dedos de Queso y Aros de Cebolla: dip ranch o cátsup.
  43: [grupoDipRanchCatsup(10)],
  44: [grupoDipRanchCatsup(20)],

  // Pepihuates: tipo de cacahuate.
  45: [
    {
      etiqueta: 'Cacahuate',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Japonés', insumo: 'Cacahuate japonés', cantidad: 100, unidad: 'g' },
        { display: 'Salado', insumo: 'Cacahuate salado', cantidad: 100, unidad: 'g' },
        { display: 'Enchilado', insumo: 'Cacahuate enchilado', cantidad: 100, unidad: 'g' },
      ],
    },
  ],
  46: [
    {
      etiqueta: 'Cacahuate',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Japonés', insumo: 'Cacahuate japonés', cantidad: 150, unidad: 'g' },
        { display: 'Salado', insumo: 'Cacahuate salado', cantidad: 150, unidad: 'g' },
        { display: 'Enchilado', insumo: 'Cacahuate enchilado', cantidad: 150, unidad: 'g' },
      ],
    },
  ],

  // Tornado: solo el dip queda estructurado — el "sazonador a elección" del
  // recetario no trae una lista de sabores concreta, así que se deja fuera
  // (mejor no inventar opciones que el negocio no confirmó).
  63: [grupoDipRanchCatsup(15)],

  // Crepa/Waffle Sencillo: 1 topping de 30 g.
  68: [grupoTopping(1, 30)],
  69: [grupoTopping(1, 30)],
  // Crepa/Waffle Especial: 3 toppings de 30 g cada uno.
  72: [grupoTopping(3, 30)],
  73: [grupoTopping(3, 30)],
};

// Devuelve los grupos de elección de una variante, o vacío si no tiene
// (en cuyo caso el POS no muestra ningún selector de elección).
export function obtenerEleccionesDeVariante(varianteId: number): GrupoEleccion[] {
  return ELECCIONES_POR_VARIANTE[varianteId] ?? [];
}
