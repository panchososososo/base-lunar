// ============ utilidades compartidas ============

export const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'];
export const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio',
                            'agosto','septiembre','octubre','noviembre','diciembre'];

export const CATEGORIAS = {
  Ingreso: ['Aporte Cami', 'Aporte Panchi', 'Baes Panchi', 'Otros'],
  Egreso:  ['Gastos', 'Servicios', 'Deudas', 'Ahorro', 'Gasto Baes'],
};

/** '2026-09-15' -> 'sept-26' (mismo formato que la columna Mes de la planilla) */
export function mesKey(iso) {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1]}-${a.slice(2)}`;
}

/** 'sept-26' -> '2026-09' para poder ordenar */
export function mesOrden(key) {
  const [m, a] = key.split('-');
  return `20${a}-${String(MESES.indexOf(m) + 1).padStart(2, '0')}`;
}

export function mesLargo(key) {
  const [m, a] = key.split('-');
  return `${MESES_LARGO[MESES.indexOf(m)]} 20${a}`;
}

/** Día `dia` del mes `key` como fecha ISO, recortado al último día real */
export function diaDelMes(key, dia) {
  const [m, a] = key.split('-');
  const anio = 2000 + Number(a), mes = MESES.indexOf(m) + 1;
  const ultimo = new Date(anio, mes, 0).getDate();
  const d = Math.min(Math.max(1, Number(dia) || 1), ultimo);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 'Lácteos, Huevos (Desayunos)' -> 'lacteos-huevos-desayunos' */
export function slug(txt) {
  return String(txt ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Mes actual en formato 'sept-26' */
export function mesHoy() {
  return mesKey(hoyISO());
}

export function hoyISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const NF = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** 134362 -> '$134.362' */
export function clp(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + NF.format(Math.abs(v));
}

/** 134362 -> '134,4k' para ejes */
export function clpCorto(n) {
  const v = Math.abs(Math.round(Number(n) || 0));
  const s = n < 0 ? '-' : '';
  if (v >= 1000000) return `${s}${(v / 1000000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1000)    return `${s}${Math.round(v / 1000)}k`;
  return `${s}${v}`;
}

/** '16.880' / '16880' / '$16 880' -> 16880 */
export function aNumero(txt) {
  if (txt == null || txt === '') return null;
  const limpio = String(txt).replace(/[^\d,-]/g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function fechaCorta(iso) {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a.slice(2)}`;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
