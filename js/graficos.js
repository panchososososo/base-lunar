// ============ gráficos (HTML + SVG, sin librerías) ============
import { clp, clpCorto, esc } from './util.js';

const vacio = t => `<p class="vacio">${esc(t)}</p>`;

/* ---------- barras rankeadas: una serie, un color, valor siempre visible ---------- */
export function barrasRankeadas(items) {
  const datos = items.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (!datos.length) return vacio('Sin movimientos este mes.');
  const max = Math.max(...datos.map(d => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0);

  return `<div class="barras">${datos.map(d => {
    const pct = Math.max(2, (d.valor / max) * 100);
    const share = Math.round((d.valor / total) * 100);
    return `<div class="barra-fila">
      <div class="barra-cab">
        <span>${esc(d.nombre)}</span>
        <b>${clp(d.valor)}<i>${share}%</i></b>
      </div>
      <div class="barra-pista"><div class="barra-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('')}</div>`;
}

/* ---------- gastado v/s presupuesto (bullet): barra + marca de meta ---------- */
export function bullet(items) {
  const datos = items.filter(i => i.meta > 0 || i.valor > 0);
  if (!datos.length) return vacio('Todavía no hay presupuestos cargados.');
  const max = Math.max(...datos.map(d => Math.max(d.valor, d.meta))) * 1.08 || 1;

  return `<div class="barras">${datos.map(d => {
    const pct  = Math.max(0, (d.valor / max) * 100);
    const meta = (d.meta / max) * 100;
    const sobre = d.meta > 0 && d.valor > d.meta;
    const dif = d.meta > 0 ? d.valor - d.meta : null;
    return `<div class="barra-fila">
      <div class="barra-cab">
        <span>${esc(d.nombre)}</span>
        <b>${clp(d.valor)}${dif === null ? '' :
          `<i class="${sobre ? 'sobre' : 'bajo'}">${sobre ? '+' : ''}${clp(dif)}</i>`}</b>
      </div>
      <div class="barra-pista">
        <div class="barra-fill${sobre ? ' sobre' : ''}" style="width:${pct}%"></div>
        ${d.meta > 0 ? `<div class="barra-meta" style="left:${meta}%" title="Presupuesto ${clp(d.meta)}"></div>` : ''}
      </div>
      ${d.meta > 0 ? `<p class="barra-pie">presupuesto ${clp(d.meta)}</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/* ---------- líneas: ingresos v/s egresos por mes ---------- */
export function lineas(cont, serie) {
  if (serie.length < 2) { cont.innerHTML = vacio('Se necesita más de un mes para comparar.'); return; }

  const W = 340, H = 168;
  const ml = 38, mr = 14, mt = 10, mb = 26;
  const pw = W - ml - mr, ph = H - mt - mb;
  const max = Math.max(1, ...serie.flatMap(d => [d.ing, d.egr]));
  const tope = escalaBonita(max);

  const x = i => ml + (serie.length === 1 ? pw / 2 : (i / (serie.length - 1)) * pw);
  const y = v => mt + ph - (v / tope) * ph;

  const linea = key => serie.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  const ticks = [0, tope / 2, tope];
  const paso = Math.ceil(serie.length / 6);

  cont.innerHTML = `
    <div class="leyenda">
      <span><i style="background:var(--series-1)"></i>Ingresos</span>
      <span><i style="background:var(--series-2)"></i>Egresos</span>
    </div>
    <div class="lienzo">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y egresos por mes">
        ${ticks.map(t => `<line x1="${ml}" x2="${W - mr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"
            stroke="var(--grid)" stroke-width="1"/>
          <text x="${ml - 6}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end"
            font-size="9" fill="var(--muted)">${clpCorto(t)}</text>`).join('')}
        ${serie.map((d, i) => i % paso === 0
          ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9"
               fill="var(--muted)">${esc(d.mes)}</text>` : '').join('')}
        <path d="${linea('ing')}" fill="none" stroke="var(--series-1)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${linea('egr')}" fill="none" stroke="var(--series-2)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
        ${serie.map((d, i) => `
          <circle cx="${x(i).toFixed(1)}" cy="${y(d.ing).toFixed(1)}" r="3"
            fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>
          <circle cx="${x(i).toFixed(1)}" cy="${y(d.egr).toFixed(1)}" r="3"
            fill="var(--series-2)" stroke="var(--surface-1)" stroke-width="2"/>`).join('')}
        <line class="cruz" x1="0" x2="0" y1="${mt}" y2="${mt + ph}"
              stroke="var(--base)" stroke-width="1" style="display:none"/>
        <rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent" class="zona"/>
      </svg>
      <div class="tip" hidden></div>
    </div>`;

  const svg = cont.querySelector('svg');
  const tip = cont.querySelector('.tip');
  const cruz = cont.querySelector('.cruz');
  const zona = cont.querySelector('.zona');

  const mover = ev => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let i = Math.round(((px - ml) / pw) * (serie.length - 1));
    i = Math.min(serie.length - 1, Math.max(0, i));
    const d = serie[i];
    cruz.setAttribute('x1', x(i)); cruz.setAttribute('x2', x(i));
    cruz.style.display = '';
    tip.hidden = false;
    tip.innerHTML = `<strong>${esc(d.mes)}</strong>
      <span><i style="background:var(--series-1)"></i>${clp(d.ing)}</span>
      <span><i style="background:var(--series-2)"></i>${clp(d.egr)}</span>`;
    const izq = (x(i) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 108, Math.max(4, izq - 54))}px`;
  };
  const salir = () => { tip.hidden = true; cruz.style.display = 'none'; };
  zona.addEventListener('pointermove', mover);
  zona.addEventListener('pointerdown', mover);
  zona.addEventListener('pointerleave', salir);
}

function escalaBonita(max) {
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (max <= m * p) return m * p;
  }
  return 10 * p;
}
