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
// producto puede tener más de un grupo (Tornado: cacahuate Y base
// líquida; Crepa/Waffle Especial: helado Y topping).
export interface GrupoEleccion {
  // Texto que ve el cajero ("Salsa", "Topping (elige 1)", "Topping (elige 3)").
  etiqueta: string;
  // Cuántas opciones de ESTE grupo puede elegir el cliente COMO MÁXIMO (casi
  // siempre 1; las crepas/waffles "especiales" hasta 3, y los paquetes
  // grandes de Alitas/Boneless reparten la salsa en 2 o 3 sabores — ver
  // grupoSalsa).
  seleccionesPermitidas: number;
  // Mínimo de selecciones para considerar la línea completa (bloquea el
  // cobro mientras no se alcance — ver personalizacionCompleta() en
  // pos.ts). Por default = seleccionesPermitidas (exige llegar al exacto,
  // el comportamiento histórico: salsa, dip, ingrediente gratis,
  // cacahuate). 0 = elección totalmente libre/opcional (toppings de
  // crepa/waffle: el cliente pide los que quiera hasta el máximo, sin
  // obligación de completarlo).
  minimoSelecciones?: number;
  // true si se puede elegir la MISMA opción más de una vez (ej. "doble
  // Nutella") — el selector pasa de casillas a un contador +/- por opción.
  // Por default false (checkbox único: cada opción solo una vez).
  permiteRepetidos?: boolean;
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

// Arma el grupo "Salsa" para una variante de alitas/boneless. `cantidadTotal`
// es el total de salsa de ESE paquete (recetario_insumos_por_platillo.txt);
// con `seleccionesPermitidas` > 1 (paquetes grandes, confirmado por Ximena:
// Alitas Paquete #3/#4 y Boneless Paquete #2/#3) se reparte entre los
// sabores elegidos — se guarda cantidadTotal / seleccionesPermitidas por
// sabor para que la suma de lo elegido siga dando el total de la receta,
// sin importar en cuántos sabores se divida.
function grupoSalsa(cantidadTotal: number, seleccionesPermitidas = 1): GrupoEleccion {
  return {
    etiqueta: seleccionesPermitidas === 1 ? 'Salsa' : `Salsas (elige ${seleccionesPermitidas})`,
    seleccionesPermitidas,
    opciones: SALSAS_ALITAS_BONELESS.map((s) => ({
      ...s,
      cantidad: cantidadTotal / seleccionesPermitidas,
      unidad: 'ml',
    })),
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

// 2026-10-08: el usuario pidió que la elección de toppings fuera "más
// libre" en vez de exigir un número exacto — ahora `maximo` es un tope, no
// una obligación (minimoSelecciones: 0, se puede pedir desde 0 toppings),
// y cada sabor se puede repetir (permiteRepetidos) para pedir, por
// ejemplo, "doble Nutella".
function grupoTopping(maximo: number, cantidadCadaUno: number): GrupoEleccion {
  return {
    etiqueta: maximo === 1 ? 'Topping (opcional)' : `Toppings (hasta ${maximo})`,
    seleccionesPermitidas: maximo,
    minimoSelecciones: 0,
    permiteRepetidos: true,
    opciones: TOPPINGS_CREPAS_WAFFLES.map((t) => ({
      ...t,
      cantidad: cantidadCadaUno,
      unidad: 'g',
    })),
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

// Sabor de helado a elección (Fresas con Crema Ice Cream, Crepa/Waffle
// Especial — confirmado 2026-10-08). Los 3 sabores nuevos (fresa, oreo,
// chocolate) se dieron de alta como insumo en Inventario junto con esta
// corrección; "vainilla" ya existía (era el único sabor que se descontaba
// antes, sin importar cuál pidiera el cliente).
function grupoHeladoSabor(cantidad: number): GrupoEleccion {
  return {
    etiqueta: 'Helado',
    seleccionesPermitidas: 1,
    opciones: [
      { display: 'Fresa', insumo: 'Helado de fresa', cantidad, unidad: 'g' },
      { display: 'Vainilla', insumo: 'Helado de vainilla', cantidad, unidad: 'g' },
      { display: 'Oreo', insumo: 'Helado de oreo', cantidad, unidad: 'g' },
      { display: 'Chocolate', insumo: 'Helado de chocolate', cantidad, unidad: 'g' },
    ],
  };
}

// Botana triturada a elección entre las 6 marcas de "Nuestras Botanas" del
// menú real (Chuchi-Elote, Elote Chorreado — confirmado 2026-10-08 contra
// RECETARIO_COMPLETO.txt). 5 de las 6 marcas solo existen como insumo de
// bolsa/sobre COMPLETA (unidad "u" — son las mismas que se venden enteras
// como "Botanas de Sobre"); todavía no hay un insumo en gramos para
// "topping triturado" de cada una, así que aquí se usan en una FRACCIÓN de
// bolsa (0.3 u, aproximado — pendiente de validar con quien cocina, igual
// que el resto de las cantidades de este recetario). Tostitos es la
// excepción: ya tiene su propio insumo en gramos (el mismo que usaban
// estos platillos antes de que esto fuera una elección), así que ese se
// deja en la cantidad real de cada variante.
function grupoBotanaTriturada(cantidadTostitosGramos: number): GrupoEleccion {
  const FRACCION_BOLSA = 0.3;
  return {
    etiqueta: 'Botana',
    seleccionesPermitidas: 1,
    opciones: [
      {
        display: 'Tostitos',
        insumo: 'Tostitos (bolsa, para preparar)',
        cantidad: cantidadTostitosGramos,
        unidad: 'g',
      },
      {
        display: 'Doritos',
        insumo: 'Doritos Nacho (sobre)',
        cantidad: FRACCION_BOLSA,
        unidad: 'u',
      },
      {
        display: 'Doritos Dinamita',
        insumo: 'Doritos Dinamita (sobre)',
        cantidad: FRACCION_BOLSA,
        unidad: 'u',
      },
      {
        display: 'Cheetos',
        insumo: 'Cheetos Flamin Hot (sobre)',
        cantidad: FRACCION_BOLSA,
        unidad: 'u',
      },
      {
        display: 'Ruffles',
        insumo: 'Ruffles Queso (sobre)',
        cantidad: FRACCION_BOLSA,
        unidad: 'u',
      },
      {
        display: 'Sabritas Crujiente',
        insumo: 'Sabritas Crujiente (sobre)',
        cantidad: FRACCION_BOLSA,
        unidad: 'u',
      },
    ],
  };
}

// ---- Mapa por variante ---------------------------------------------------
// Las cantidades salen de recetario_insumos_por_platillo.txt (mismo borrador
// usado en scripts/seed-recetas.js) — sin validar por Ximena todavía.
const ELECCIONES_POR_VARIANTE: Record<number, GrupoEleccion[]> = {
  // Alitas (2026-10-08: paquetes grandes reparten la salsa en varios
  // sabores, igual que ya escala el dip de aderezo ranch en el menú real).
  31: [grupoSalsa(60)], // 12 piezas — 1 salsa
  32: [grupoSalsa(40)], // Paquete #1 (8 pz) — 1 salsa
  33: [grupoSalsa(60)], // Paquete #2 (12 pz) — 1 salsa
  // Paquete #3 (24 pz): 2 salsas + elige papas o aros de cebolla (150 g) —
  // confirmado 2026-10-08 contra ELECCIONES_TOPPINGS_DIPS_SALSAS.txt. El
  // Paquete #4 NO tiene esta elección: su receta ya incluye papas Y aros
  // fijos (ver receta_insumos de la variante 35), no es una u otra.
  34: [
    grupoSalsa(120, 2),
    {
      etiqueta: 'Papas o aros de cebolla',
      seleccionesPermitidas: 1,
      opciones: [
        {
          display: 'Papas a la francesa',
          insumo: 'Papas a la francesa',
          cantidad: 150,
          unidad: 'g',
        },
        {
          display: 'Aros de cebolla',
          insumo: 'Aros de cebolla empanizados',
          cantidad: 150,
          unidad: 'g',
        },
      ],
    },
  ],
  35: [grupoSalsa(180, 3)], // Paquete #4 (36 pz) — 3 salsas, 60 ml c/u

  // Boneless (solo los paquetes de 250 g reparten en 2 salsas; el de 125 g
  // y la orden sola se quedan en 1, igual que su dip de ranch nunca escala).
  36: [grupoSalsa(60)], // 250 g solo — 1 salsa
  37: [grupoSalsa(40)], // Paquete #1 (125 g) — 1 salsa
  38: [grupoSalsa(60, 2)], // Paquete #2 (250 g) — 2 salsas, 30 ml c/u
  39: [grupoSalsa(60, 2)], // Paquete #3 (250 g) — 2 salsas, 30 ml c/u

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

  // Tornado (2026-10-08): el menú real NO es una papa — es un cóctel de
  // frutas (corregido en receta_insumos de la variante 63: antes tenía
  // por error "Papa tornado" y un dip de ranch/cátsup que tampoco
  // correspondía). El cacahuate y la base líquida quedan como elección;
  // chamoy, chile en polvo y huesitos de tamarindo ya quedaron fijos en
  // la receta. "Agua mineral" se reutiliza en fracción de botella (0.25 u
  // de la de 600 ml) y "Refresco de toronja" se dio de alta como insumo
  // nuevo — ninguno de los dos tenía antes una presentación chica.
  63: [
    {
      etiqueta: 'Cacahuate',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Japonés', insumo: 'Cacahuate japonés', cantidad: 30, unidad: 'g' },
        { display: 'Salado', insumo: 'Cacahuate salado', cantidad: 30, unidad: 'g' },
        { display: 'Enchilado', insumo: 'Cacahuate enchilado', cantidad: 30, unidad: 'g' },
      ],
    },
    {
      etiqueta: 'Base líquida',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Clamato', insumo: 'Clamato (base)', cantidad: 150, unidad: 'ml' },
        {
          display: 'Agua mineral',
          insumo: 'Agua Mineral 600 ml (botella)',
          cantidad: 0.25,
          unidad: 'u',
        },
        {
          display: 'Refresco de toronja',
          insumo: 'Refresco de toronja',
          cantidad: 150,
          unidad: 'ml',
        },
      ],
    },
  ],

  // Pichachitos Preparados (2026-10-08): 3 de 6 ingredientes a elección,
  // confirmado contra RECETARIO_COMPLETO.txt. Cantidad aproximada (15 g
  // cada uno) — el menú no da gramaje. "Pepino" y "Cueros/cueritos" se
  // dieron de alta como insumo nuevo junto con esta corrección.
  49: [
    {
      etiqueta: 'Ingredientes (elige 3)',
      seleccionesPermitidas: 3,
      opciones: [
        { display: 'Mayonesa', insumo: 'Mayonesa', cantidad: 15, unidad: 'g' },
        { display: 'Queso amarillo', insumo: 'Queso amarillo', cantidad: 15, unidad: 'g' },
        { display: 'Elote', insumo: 'Elote desgranado', cantidad: 15, unidad: 'g' },
        { display: 'Pepino', insumo: 'Pepino', cantidad: 15, unidad: 'g' },
        { display: 'Cueros', insumo: 'Cueritos', cantidad: 15, unidad: 'g' },
        {
          display: 'Cacahuate',
          insumo: 'Cacahuate (japonés/salado/enchilado)',
          cantidad: 15,
          unidad: 'g',
        },
      ],
    },
  ],

  // Tostitos con Camarón (54 g, variante 55): tipo de camarón a elegir —
  // se quitó "Camarón cóctel (cocido)" de la receta fija (ahora es una de
  // las 2 opciones, no automático). "Camarón aguachile" es insumo nuevo.
  55: [
    {
      etiqueta: 'Tipo de camarón',
      seleccionesPermitidas: 1,
      opciones: [
        { display: 'Cocido', insumo: 'Camarón cóctel (cocido, pelado)', cantidad: 80, unidad: 'g' },
        { display: 'Aguachile', insumo: 'Camarón aguachile', cantidad: 80, unidad: 'g' },
      ],
    },
  ],

  // Manzana Loca (variante 61): cacahuate o gomitas — se quitó "Dulce
  // enchilado" de la receta fija (no correspondía a ninguna de las 2
  // opciones reales). "Gomitas" es insumo nuevo.
  61: [
    {
      etiqueta: 'Cacahuate o gomitas',
      seleccionesPermitidas: 1,
      opciones: [
        {
          display: 'Cacahuate',
          insumo: 'Cacahuate (japonés/salado/enchilado)',
          cantidad: 20,
          unidad: 'g',
        },
        { display: 'Gomitas', insumo: 'Gomitas', cantidad: 20, unidad: 'g' },
      ],
    },
  ],

  // Fresas con Crema Ice Cream (variante 67): sabor de helado — se quitó
  // "Helado de vainilla" fijo de la receta (ahora es una de las 4
  // opciones, no automático sin importar lo que pida el cliente).
  67: [grupoHeladoSabor(100)],

  // Crepa/Waffle Sencillo: hasta 1 topping de 30 g (opcional, se puede
  // pedir sin ninguno).
  68: [grupoTopping(1, 30)],
  69: [grupoTopping(1, 30)],
  // Crepa/Waffle Especial: hasta 3 toppings de 30 g cada uno (opcional;
  // se puede repetir el mismo sabor, ej. "doble Nutella") MÁS sabor de
  // helado a elegir (se quitó "Helado de vainilla" fijo de la receta,
  // mismo motivo que Fresas con Crema Ice Cream) — dos grupos en la misma
  // variante, igual patrón que ya soporta el array (Tornado: cacahuate +
  // base líquida).
  72: [grupoHeladoSabor(50), grupoTopping(3, 30)],
  73: [grupoHeladoSabor(50), grupoTopping(3, 30)],

  // Chuchi-Elote y Elote Chorreado: botana triturada a elección (2026-10-08,
  // confirmado contra RECETARIO_COMPLETO.txt sección 7 — "Nuestras
  // Botanas"). En Chuchi-Elote se quitó la línea fija de Tostitos de su
  // receta_insumos (variante 59) porque ahora es una de las 6 opciones de
  // este grupo, no un ingrediente automático.
  59: [grupoBotanaTriturada(20)], // Chuchi-Elote
  60: [grupoBotanaTriturada(40)], // Elote Chorreado
};

// Devuelve los grupos de elección de una variante, o vacío si no tiene
// (en cuyo caso el POS no muestra ningún selector de elección).
export function obtenerEleccionesDeVariante(varianteId: number): GrupoEleccion[] {
  return ELECCIONES_POR_VARIANTE[varianteId] ?? [];
}
