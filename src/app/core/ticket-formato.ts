// Ayudas compartidas para armar los tickets en TEXTO (venta, retiro y listado
// de retiros): 32 columnas, el ancho de una térmica de 58 mm. Se usan tanto
// para el bloque <pre> que se imprime con el navegador como para el texto que
// recibe el agente de impresión (ESC/POS). Todo en un solo lugar para que los
// tres tickets se vean con el mismo estilo.

export const ANCHO_TICKET = 32;

// Quita acentos/ñ y "¡"/"¿": los controladores de texto de Windows mangulan
// cualquier carácter fuera de ASCII.
export function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¡¿]/g, '');
}

export function dinero(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function dosColumnas(izquierda: string, derecha: string, ancho = ANCHO_TICKET): string {
  const espacios = Math.max(1, ancho - izquierda.length - derecha.length);
  return izquierda + ' '.repeat(espacios) + derecha;
}

export function centrar(texto: string, ancho = ANCHO_TICKET): string {
  return ' '.repeat(Math.max(0, Math.floor((ancho - texto.length) / 2))) + texto;
}

// Parte un texto largo en renglones de a lo más `ancho` caracteres.
export function envolver(texto: string, ancho = ANCHO_TICKET): string[] {
  const salida: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    if (actual && (actual + ' ' + palabra).length > ancho) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = actual ? actual + ' ' + palabra : palabra;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

export const LINEA_SIMPLE = '-'.repeat(ANCHO_TICKET);
export const LINEA_DOBLE = '='.repeat(ANCHO_TICKET);

const UNIDADES = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciseis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidos',
  'veintitres',
  'veinticuatro',
  'veinticinco',
  'veintiseis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];
const DECENAS = [
  '',
  '',
  '',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
];
const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

function menorDeMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 30) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
  }
  return partes.join(' ');
}

function enLetras(n: number): string {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'un millon' : `${menorDeMil(millones)} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${menorDeMil(miles).replace(/uno$/, 'un')} mil`);
  if (resto) partes.push(menorDeMil(resto));
  return partes.join(' ');
}

// 200 -> "(Doscientos pesos 00/100 M.N.)", 45.5 -> "(Cuarenta y cinco pesos 50/100 M.N.)"
export function importeEnLetras(monto: number): string {
  const centavosTotales = Math.round(Math.abs(monto) * 100);
  const pesos = Math.floor(centavosTotales / 100);
  const centavos = String(centavosTotales % 100).padStart(2, '0');
  const letras = pesos === 1 ? 'un' : enLetras(pesos).replace(/uno$/, 'un');
  const capital = letras.charAt(0).toUpperCase() + letras.slice(1);
  const moneda = pesos === 1 ? 'peso' : 'pesos';
  // "un millon de pesos" / "veintiun millones de pesos"
  const de = pesos > 0 && pesos % 1_000_000 === 0 ? ' de' : '';
  return `(${capital}${de} ${moneda} ${centavos}/100 M.N.)`;
}
