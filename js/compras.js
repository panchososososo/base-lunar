// ============ compras: precio de cada cosa, semana a semana ============
// Cada fila de `compras` es un producto comprado. Las filas con la misma
// `compra` (misma fecha y lugar) forman una compra, que se registra sola como
// un gasto en movimientos (el id del movimiento es el de la compra).
import { clp, clpCorto, esc, MESES } from './util.js';
import { clave } from './secciones.js';

// ---------- números escritos a mano ----------
/** Plata: '2.2k' → 2200, '2.200' → 2200, '$1.500' → 1500, '1,5' → 1500.
 *  Menos de 100 se entiende como miles (en la feria nada cuesta $2,2). */
export function plata(txt) {
  if (txt == null) return null;
  let t = String(txt).toLowerCase().replace(/[$\s]/g, '');
  if (!t) return null;
  let mult = 1;
  if (t.endsWith('k') || t.endsWith('lucas') || t.endsWith('luca')) {
    mult = 1000; t = t.replace(/(k|lucas?)$/, '');
  }
  if (mult === 1 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const v = n * mult;
  return Math.round(v < 100 ? v * 1000 : v);
}

/** Cantidad: '1,5' / '1.5' / '1.5kg' / '3' → número. */
export function cantidad(txt) {
  if (txt == null) return null;
  const t = String(txt).toLowerCase().replace(/\s|kgs?|kilos?|k|un(idades?)?/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Completa el dato que falta: con dos de (cantidad, precio, total) saca el tercero. */
export function resolver({ cant, precio, total }) {
  if (total == null && cant != null && precio != null) total = Math.round(cant * precio);
  if (cant == null && total != null && precio != null) cant = Math.round((total / precio) * 1000) / 1000;
  if (precio == null && total != null && cant != null) precio = Math.round(total / cant);
  return { cant, precio, total };
}

export const fmtCant = (n, unidad) => n == null ? '' :
  `${String(Math.round(n * 100) / 100).replace('.', ',')} ${unidad === 'kg' ? 'kg' : 'un'}`;

export const porUnidad = u => (u === 'kg' ? '/kg' : '/un');

// ---------- semanas (lunes a domingo) ----------
export function lunes(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const dia = (d.getDay() + 6) % 7;          // 0 = lunes
  d.setDate(d.getDate() - dia);
  return d.toISOString().slice(0, 10);
}

export function etiquetaSemana(lun) {
  const [, m, d] = lun.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- agregados ----------
/** Agrupa las filas en compras (fecha + lugar), de la más nueva a la más vieja. */
export function agruparCompras(filas) {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.compra)) m.set(f.compra, { id: f.compra, fecha: f.fecha, lugar: f.lugar, items: [], total: 0 });
    const c = m.get(f.compra);
    c.items.push(f);
    c.total += Number(f.total) || 0;
  }
  return [...m.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.lugar.localeCompare(b.lugar));
}

/** Gasto por semana, las últimas `n` semanas hasta la de hoy (incluye semanas en 0). */
export function gastoSemanal(filas, hoy, n = 8) {
  const fin = lunes(hoy);
  const semanas = Array.from({ length: n }, (_, i) => sumarDias(fin, -7 * (n - 1 - i)));
  const tot = new Map(semanas.map(s => [s, 0]));
  for (const f of filas) {
    const s = lunes(f.fecha);
    if (tot.has(s)) tot.set(s, tot.get(s) + (Number(f.total) || 0));
  }
  return semanas.map(s => ({ semana: s, total: tot.get(s) }));
}

/** Precio promedio por semana de cada producto (total / cantidad de esa semana). */
export function preciosPorProducto(filas) {
  const prods = new Map();
  for (const f of filas) {
    if (!(f.cantidad > 0) || !(f.total > 0)) continue;
    const k = `${clave(f.producto)}|${f.unidad}`;
    if (!prods.has(k)) prods.set(k, { nombre: f.producto, unidad: f.unidad, ultima: f.fecha, semanas: new Map() });
    const p = prods.get(k);
    if (f.fecha >= p.ultima) { p.ultima = f.fecha; p.nombre = f.producto; }
    const s = lunes(f.fecha);
    const w = p.semanas.get(s) || { total: 0, cant: 0, lugares: new Set() };
    w.total += Number(f.total); w.cant += Number(f.cantidad); w.lugares.add(f.lugar);
    p.semanas.set(s, w);
  }
  return [...prods.values()].map(p => {
    const serie = [...p.semanas.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([semana, w]) => ({ semana, precio: Math.round(w.total / w.cant), lugares: [...w.lugares] }));
    const actual = serie.at(-1);
    const previa = serie.at(-2) || null;
    const variacion = previa ? (actual.precio - previa.precio) / previa.precio : null;
    return { ...p, serie, actual, previa, variacion };
  }).sort((a, b) => b.ultima.localeCompare(a.ultima) || a.nombre.localeCompare(b.nombre));
}

// ---------- dibujos ----------
export function barrasSemanas(serie) {
  const max = Math.max(1, ...serie.map(s => s.total));
  if (!serie.some(s => s.total > 0)) return '<p class="vacio">Todavía no hay compras anotadas.</p>';
  return `<div class="semanas" role="img" aria-label="Gasto por semana">${serie.map((s, i) => {
    const h = s.total ? Math.max(3, (s.total / max) * 100) : 0;
    const ult = i === serie.length - 1;
    return `<div class="semana${ult ? ' actual' : ''}" title="Semana del ${etiquetaSemana(s.semana)}: ${clp(s.total)}">
      <span class="valor">${s.total ? clpCorto(s.total) : ''}</span>
      <div class="pista"><div class="barra" style="height:${h}%"></div></div>
      <span class="etq">${etiquetaSemana(s.semana)}</span>
    </div>`;
  }).join('')}</div>`;
}

export function chispa(serie) {
  if (serie.length < 2) return '';
  const W = 64, H = 22, p = 2;
  const vals = serie.map(s => s.precio);
  const min = Math.min(...vals), max = Math.max(...vals);
  const rango = max - min || 1;
  const x = i => p + (i / (serie.length - 1)) * (W - 2 * p);
  const y = v => H - p - ((v - min) / rango) * (H - 2 * p);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `<svg class="chispa" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(--series-1)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(vals.length - 1).toFixed(1)}" cy="${y(vals.at(-1)).toFixed(1)}" r="2.2" fill="var(--series-1)"/>
  </svg>`;
}

export function variacionHTML(v) {
  if (v == null) return '<span class="var nueva">nuevo</span>';
  const pct = Math.round(v * 100);
  if (pct === 0) return '<span class="var igual">= 0%</span>';
  return pct > 0
    ? `<span class="var sube" title="Más caro que la semana anterior">▲ ${pct}%</span>`
    : `<span class="var baja" title="Más barato que la semana anterior">▼ ${Math.abs(pct)}%</span>`;
}

export function filaProducto(p) {
  const u = porUnidad(p.unidad);
  return `<details class="producto">
    <summary>
      <span class="nombre">${esc(p.nombre)}</span>
      ${chispa(p.serie)}
      <span class="precio-actual">${clp(p.actual.precio)}<small>${u}</small></span>
      ${variacionHTML(p.variacion)}
    </summary>
    <table class="historia-precio">
      <thead><tr><th>Semana</th><th>Dónde</th><th>Precio</th></tr></thead>
      <tbody>${[...p.serie].reverse().map(s => `<tr>
        <td>${etiquetaSemana(s.semana)}</td><td>${esc(s.lugares.join(', '))}</td>
        <td>${clp(s.precio)}${u}</td></tr>`).join('')}</tbody>
    </table>
  </details>`;
}
