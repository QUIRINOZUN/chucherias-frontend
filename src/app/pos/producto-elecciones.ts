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

  // Tornado: SIN grupo de elección a propósito. Se había puesto aquí un
  // dip de ranch/cátsup (grupoDipRanchCatsup) por error — ni el menú real
  // ni la receta cargada (receta_insumos de la variante 63, solo "Papa
  // tornado") mencionan ningún dip; lo que el Tornado sí tiene es un
  // "sazonador a elección" sin lista de sabores confirmada todavía
  // (2026-10-08, ver ELECCIONES_TOPPINGS_DIPS_SALSAS.txt) — mejor no
  // elección ninguna que una equivocada. No agregar nada aquí hasta tener
  // la lista real de sabores de Ximena.

  // Crepa/Waffle Sencillo: hasta 1 topping de 30 g (opcional, se puede
  // pedir sin ninguno).
  68: [grupoTopping(1, 30)],
  69: [grupoTopping(1, 30)],
  // Crepa/Waffle Especial: hasta 3 toppings de 30 g cada uno (opcional;
  // se puede repetir el mismo sabor, ej. "doble Nutella").
  72: [grupoTopping(3, 30)],
  73: [grupoTopping(3, 30)],
};

// Devuelve los grupos de elección de una variante, o vacío si no tiene
// (en cuyo caso el POS no muestra ningún selector de elección).
export function obtenerEleccionesDeVariante(varianteId: number): GrupoEleccion[] {
  return ELECCIONES_POR_VARIANTE[varianteId] ?? [];
}
