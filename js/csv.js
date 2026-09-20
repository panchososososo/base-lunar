// ============ leer el CSV exportado de la planilla ============
// Acepta el formato de la hoja "Registros" tal como lo exporta Excel:
//   Fecha, Mes, Tipo, Categoría, Concepto, Presupuestos, Monto
// Tolera el encabezado con el título arriba, las filas separadoras vacías,
// los montos con $ y separadores de miles, y el texto en Windows-1252
// (que es como Excel guarda los CSV en español si no se le pide UTF-8).

const MES_NUM = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const TIPOS = { ingreso: 'Ingreso', egreso: 'Egreso' };

/** Lee el archivo probando UTF-8 y cayendo a Windows-1252 si no calza. */
export async function leerTexto(archivo) {
  const buf = await archivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** CSV -> matriz, respetando comillas y comas dentro de los campos. */
export function filasCrudas(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/** '01-Jun-26', '01-jun-26', '2026-06-01', '01/06/2026' -> '2026-06-01' */
export function aFecha(txt) {
  const s = String(txt ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[-/ ]([A-Za-zÁÉÍÓÚáéíóú]{3,4})[-/ ](\d{2,4})$/);
  if (m) {
    const mes = MES_NUM[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (!mes) return null;
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${a}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);   // día/mes/año
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** ' $200,000 ' / '200.000' / '200000' -> 200000  (los pesos no llevan decimales) */
export function aMonto(txt) {
  const s = String(txt ?? '').replace(/[^\d-]/g, '');
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Texto de un CSV -> { movimientos, sinMonto, sinFecha }
 * Solo devuelve filas con fecha y monto; el resto se informa para que se vea
 * qué quedó fuera, en vez de desaparecer en silencio.
 */
export function parsearCsv(texto) {
  const movimientos = [], sinMonto = [], sinFecha = [];

  for (const fila of filasCrudas(texto)) {
    if (fila.length < 5) continue;
    const [f, , tipoTxt, catTxt, conTxt, pptoTxt, montoTxt] = fila.map(x => (x ?? '').trim());

    const fecha = aFecha(f);
    const tipo = TIPOS[(tipoTxt || '').toLowerCase()];
    const concepto = conTxt;

    if (!fecha || !tipo) {
      if (tipo && concepto) sinFecha.push(`${concepto} (${f || 'sin fecha'})`);
      continue;                                   // encabezados y separadoras
    }
    const monto = aMonto(montoTxt);
    if (monto === null || monto === 0) {
      sinMonto.push(`${concepto} · ${f}`);        // proyecciones sin monto real
      continue;
    }
    movimientos.push({
      fecha, tipo,
      categoria: (catTxt || (tipo === 'Ingreso' ? 'Otros' : 'Gastos')).trim(),
      concepto: concepto || 'Sin nombre',
      presupuesto: aMonto(pptoTxt),
      monto,
    });
  }
  return { movimientos, sinMonto, sinFecha };
}
