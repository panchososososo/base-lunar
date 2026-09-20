// ============ leer movimientos escritos a mano ============
// Convierte texto suelto —como el que se anotan por WhatsApp— en movimientos.
// Nunca guarda nada solo: la app muestra lo que entendió para que se revise.

const PISTAS_INGRESO = [
  'devolucion', 'devolvieron', 'devuelto', 'reembolso', 'aporte', 'transfirio',
  'transferencia', 'me pagaron', 'sueldo', 'beca', 'baes', 'recuperamos',
  'me llego', 'abono', 'regalo', 'premio',
];

const CAT_EGRESO = [
  ['Servicios',  ['agua', 'luz', 'electricidad', 'gas', 'internet', 'wifi', 'claro',
                  'entel', 'movistar', 'wom', 'vtr', 'gtd', 'contribuciones',
                  'gastos comunes', 'cuenta de']],
  ['Deudas',     ['cuota', 'refri', 'refrigerador', 'estufa', 'lavadora', 'secadora',
                  'credito', 'tarjeta', 'prestamo', 'deuda', 'pie']],
  ['Ahorro',     ['ahorro', 'ahorrar', 'guardar plata']],
  ['Gasto Baes', ['baes']],
];

const CAT_INGRESO = [
  ['Baes Panchi',   ['baes']],
  ['Aporte Cami',   ['cami', 'camila']],
  ['Aporte Panchi', ['panchi', 'pancho', 'francisco']],
];

const sinTildes = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function categoriaDe(concepto, tipo = 'Egreso') {
  const c = sinTildes(concepto);
  const tabla = tipo === 'Ingreso' ? CAT_INGRESO : CAT_EGRESO;
  for (const [cat, claves] of tabla) {
    if (claves.some(k => c.includes(k))) return cat;
  }
  if (tipo === 'Egreso' && /\b\d+\s*\/\s*\d+\b/.test(concepto)) return 'Deudas';
  return tipo === 'Ingreso' ? 'Otros' : 'Gastos';
}

// "30 lucas" = 30.000, "2 palos" = 2.000.000
const MULTIPLOS = [
  [/^(lucas?|mil|k)$/i, 1000],
  [/^(palos?|millones?|millon)$/i, 1000000],
];

/** Todos los números de la línea que podrían ser el monto, con su posición. */
function candidatos(linea) {
  const out = [];
  // El punto separa miles (16.880). El espacio NO, si no "Super 10 23720"
  // se leería como "10 237".
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)(\s*[a-záéíóúñ]+)?/gi;
  let m;
  while ((m = re.exec(linea)) !== null) {
    const [todo, numero, cola = ''] = m;
    const antes = linea[m.index - 1] ?? '';
    const despues = linea[m.index + numero.length] ?? '';
    // "Refri 4/6" o "1/2 kilo": no son montos
    if (antes === '/' || despues === '/') continue;

    let valor = Number(numero.replace(/\./g, ''));
    let largo = numero.length;
    const palabra = cola.trim();
    for (const [re2, factor] of MULTIPLOS) {
      if (re2.test(palabra)) { valor *= factor; largo = todo.length; break; }
    }
    if (!Number.isFinite(valor) || valor < 100) continue;  // "Super 10" no es un monto
    out.push({ valor, inicio: m.index, largo });
  }
  return out;
}

function limpiar(txt) {
  const t = txt.replace(/\s+/g, ' ')
    .replace(/[\s,;:.\-–—]+$/u, '').replace(/^[\s,;:.\-–—]+/u, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** Una línea -> movimiento, o null si no se entiende. */
export function parsearLinea(linea) {
  const cruda = linea.trim();
  if (!cruda) return null;

  const nums = candidatos(cruda);
  if (!nums.length) return { error: 'sin monto', texto: cruda };

  // el monto es el número más grande de la línea
  const elegido = nums.reduce((a, b) => (b.valor > a.valor ? b : a));
  const resto = cruda.slice(0, elegido.inicio) + ' ' + cruda.slice(elegido.inicio + elegido.largo);

  const conSigno = /^\s*\+/.test(cruda);
  const conMenos = /^\s*[-−]/.test(cruda);
  const texto = sinTildes(resto);
  const pareceIngreso = conSigno ||
    (!conMenos && PISTAS_INGRESO.some(p => texto.includes(p)));

  const tipo = pareceIngreso ? 'Ingreso' : 'Egreso';
  const concepto = limpiar(resto.replace(/^\s*[+\-−]\s*/, '')) || 'Sin nombre';

  return {
    tipo,
    monto: elegido.valor,
    concepto,
    categoria: categoriaDe(concepto, tipo),
    texto: cruda,
  };
}

/** Texto completo -> { movimientos, ignoradas } */
export function parsear(texto, fecha) {
  const movimientos = [];
  const ignoradas = [];
  for (const linea of String(texto).split(/\r?\n/)) {
    const r = parsearLinea(linea);
    if (!r) continue;
    if (r.error) { ignoradas.push(r.texto); continue; }
    movimientos.push({ ...r, fecha, presupuesto: null });
  }
  return { movimientos, ignoradas };
}
