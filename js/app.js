// ============ Base Lunar — controlador ============
import { datos, LUGARES } from './datos.js';
import { barrasRankeadas, bullet, lineas } from './graficos.js';
import { exportarXlsx, exportarCsv } from './excel.js';
import { parsear, categoriaDe } from './parser.js';
import {
  CATEGORIAS, clp, diaDelMes, esc, fechaCorta, hoyISO, mesHoy, mesKey, mesLargo,
  mesOrden, aNumero, uid,
} from './util.js';

const TODOS = '__todos__';   // opción "todos los meses" del historial

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const estado = {
  mes: mesHoy(),
  tipo: 'Egreso',
  categoria: 'Gastos',
  editando: null,
  lista: 'Falta',
  lugarNuevo: LUGARES[0],
  filtroLugar: 'Todo',
  modoRegistro: 'uno',
  previo: [],
  ignoradas: [],
};

const ICONO_TIC   = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>';
const ICONO_QUITA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/* ================== arranque ================== */

aplicarTema(localStorage.getItem('bl.tema') || 'dark');

(async function arrancar() {
  cablear();
  try {
    await datos.iniciar();
  } catch (e) {
    console.warn('Supabase no disponible:', e);
  }

  if (!datos.configurado) $('#login-sin-config').hidden = false;

  datos.alCambiar = () => { pintarTodo(); };
  datos.alEstado  = () => { pintarEstado(); };

  if (datos.usuario || datos.modoLocal || !datos.configurado) {
    entrarALaApp();
  } else {
    mostrar('login');
    $('#sub-estado').textContent = 'inicia sesión';
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  addEventListener('online', () => datos.sincronizar().catch(() => {}));
})();

async function entrarALaApp() {
  mostrar('resumen');
  pintarTodo();
  pintarEstado();
  if (datos.usuario) {
    try { await datos.sincronizar(); datos.escuchar(); }
    catch (e) { aviso('No se pudo sincronizar. Se está usando la copia local.'); }
  }
}

/* ================== navegación ================== */

function mostrar(nombre) {
  $$('.pantalla').forEach(p => p.classList.toggle('activa', p.id === `pantalla-${nombre}`));
  $$('#nav button').forEach(b => b.classList.toggle('activo', b.dataset.ir === nombre));
  const enLogin = nombre === 'login';
  $('#nav').hidden = enLogin;
  $('#btn-ajustes').hidden = enLogin;   // sin sesión no hay nada que ajustar
  scrollTo({ top: 0 });
}

function cablear() {
  $$('#nav button').forEach(b => b.onclick = () => {
    mostrar(b.dataset.ir);
    if (b.dataset.ir === 'historial') { $('#hist-mes').value = estado.mes; pintarHistorial(); }
    if (b.dataset.ir === 'presupuestos') { pintarPresupuestos(); pintarFijos(); }
    if (b.dataset.ir === 'registrar') { prepararForm(); modoRegistro(estado.modoRegistro); }
    if (b.dataset.ir === 'lista') pintarLista();
  });
  $('#btn-ajustes').onclick = () => { mostrar('ajustes'); pintarAjustes(); };

  // --- login ---
  $('#form-login').onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#login-error');
    err.hidden = true;
    try {
      await datos.entrar($('#login-email').value.trim(), $('#login-clave').value);
      entrarALaApp();
    } catch (e) {
      err.textContent = e.message === 'Invalid login credentials'
        ? 'Correo o clave incorrectos.' : (e.message || 'No se pudo entrar.');
      err.hidden = false;
    }
  };
  $('#btn-modo-local').onclick = () => { datos.usarLocal(); entrarALaApp(); };
  $('#btn-salir').onclick = async () => { await datos.salir(); location.reload(); };

  // --- mes ---
  $('#selector-mes').onchange = ev => { estado.mes = ev.target.value; pintarResumen(); };
  $('#mes-antes').onclick    = () => moverMes(-1);
  $('#mes-despues').onclick  = () => moverMes(1);

  // --- formulario ---
  $$('#form-mov .seg').forEach(b => b.onclick = () => {
    estado.tipo = b.dataset.tipo;
    $$('#form-mov .seg').forEach(x => x.classList.toggle('activo', x === b));
    estado.categoria = CATEGORIAS[estado.tipo][0];
    pintarChips();
  });
  $('#form-mov').onsubmit = guardarMovimiento;
  $('#btn-cancelar').onclick = () => prepararForm();

  // --- pegar varios ---
  $$('#seg-registro .seg').forEach(b => b.onclick = () => modoRegistro(b.dataset.modo));
  $('#btn-leer').onclick = leerPegado;

  // --- gastos fijos ---
  $('#form-fijo').onsubmit = async ev => {
    ev.preventDefault();
    const concepto = $('#fj-concepto').value.trim();
    const dia = Number($('#fj-dia').value);
    if (!concepto || !dia) return;
    await datos.guardarFijo({
      concepto,
      monto: aNumero($('#fj-monto').value),
      dia: Math.min(31, Math.max(1, dia)),
      tipo: 'Egreso',
      categoria: categoriaDe(concepto, 'Egreso'),
    });
    $('#fj-concepto').value = ''; $('#fj-monto').value = ''; $('#fj-dia').value = '';
    pintarFijos();
    pintarFijosPendientes();
  };

  // --- historial ---
  $('#hist-mes').onchange = pintarHistorial;
  $('#hist-buscar').oninput = pintarHistorial;

  // --- presupuestos ---
  $('#form-ppto').onsubmit = async ev => {
    ev.preventDefault();
    const nombre = $('#p-nombre').value.trim();
    const monto = aNumero($('#p-monto').value);
    if (!nombre || monto == null) return;
    await datos.guardarPpto({ id: uid(), clasificacion: nombre, monto, comentario: '' });
    $('#p-nombre').value = ''; $('#p-monto').value = '';
    pintarPresupuestos();
  };

  // --- listas ---
  $$('#seg-lista .seg').forEach(b => b.onclick = () => {
    estado.lista = b.dataset.lista;
    pintarLista();
  });
  $('#form-falta').onsubmit = async ev => {
    ev.preventDefault();
    const nombre = $('#i-nombre').value.trim();
    if (!nombre) return;
    await datos.agregarItem({ tipo: 'Falta', nombre, lugar: estado.lugarNuevo });
    $('#i-nombre').value = '';
    $('#i-nombre').focus();
    pintarLista();
  };
  $('#form-deseo').onsubmit = async ev => {
    ev.preventDefault();
    const nombre = $('#d-nombre').value.trim();
    if (!nombre) return;
    await datos.agregarItem({ tipo: 'Deseo', nombre, precio: aNumero($('#d-precio').value) });
    $('#d-nombre').value = ''; $('#d-precio').value = '';
    $('#d-nombre').focus();
    pintarLista();
  };

  // --- ajustes ---
  $('#btn-export-xlsx').onclick = async () => {
    try { await exportarXlsx(datos.movimientos); }
    catch { aviso('No se pudo generar el Excel (¿sin internet?). Prueba con CSV.'); }
  };
  $('#btn-export-csv').onclick = () => exportarCsv(datos.movimientos);
  $('#btn-refrescar').onclick = async () => {
    try { await datos.sincronizar(); aviso('Todo al día.'); }
    catch { aviso('No se pudo sincronizar.'); }
  };
  $('#btn-importar').onclick = importarHistorico;
  $$('#seg-tema .seg').forEach(b => b.onclick = () => aplicarTema(b.dataset.tema));

  document.addEventListener('input', ev => {
    if (ev.target.matches('#f-monto, #f-ppto, #p-monto, #d-precio')) formatearMiles(ev.target);
  });
}

// paso: -1 = mes anterior (más atrás en el tiempo), +1 = mes siguiente.
// mesesDisponibles() viene del más nuevo al más viejo, así que retroceder
// en el tiempo es AVANZAR en el índice: por eso va `i - paso`.
function moverMes(paso) {
  const lista = mesesDisponibles();
  const i = lista.indexOf(estado.mes);
  const j = Math.min(lista.length - 1, Math.max(0, i - paso));
  estado.mes = lista[j];
  pintarResumen();
}

/* ================== pintado ================== */

function pintarTodo() {
  pintarResumen();
  pintarGlobo();
  if ($('#pantalla-historial').classList.contains('activa')) pintarHistorial();
  if ($('#pantalla-presupuestos').classList.contains('activa')) { pintarPresupuestos(); pintarFijos(); }
  if ($('#pantalla-lista').classList.contains('activa')) pintarLista();
}

function mesesDisponibles() {
  const set = new Set(datos.movimientos.map(m => mesKey(m.fecha)));
  set.add(mesHoy());
  return [...set].sort((a, b) => mesOrden(b).localeCompare(mesOrden(a)));
}

function delMes(mes) {
  return datos.movimientos.filter(m => mesKey(m.fecha) === mes);
}

function pintarResumen() {
  const lista = mesesDisponibles();
  if (!lista.includes(estado.mes)) estado.mes = lista[0];
  const opciones = lista.map(m => `<option value="${m}">${esc(mesLargo(m))}</option>`).join('');
  const previoHist = $('#hist-mes').value;
  $('#selector-mes').innerHTML = opciones;
  $('#hist-mes').innerHTML = `<option value="${TODOS}">Todos los meses</option>` + opciones;
  $('#selector-mes').value = estado.mes;
  $('#hist-mes').value = (previoHist === TODOS || lista.includes(previoHist))
    ? previoHist : estado.mes;

  const movs = delMes(estado.mes);
  const ing = movs.filter(m => m.tipo === 'Ingreso');
  const egr = movs.filter(m => m.tipo === 'Egreso');
  const sum = a => a.reduce((s, m) => s + m.monto, 0);
  const sumP = a => a.reduce((s, m) => s + (m.presupuesto || 0), 0);

  const ti = sum(ing), te = sum(egr), saldo = ti - te;

  const cifra = $('#cifra-saldo');
  cifra.textContent = clp(saldo);
  cifra.className = `cifra ${saldo >= 0 ? 'positivo' : 'negativo'}`;
  $('#saldo-detalle').textContent = movs.length
    ? `${movs.length} movimiento${movs.length === 1 ? '' : 's'} en ${mesLargo(estado.mes)}`
    : `Sin movimientos en ${mesLargo(estado.mes)}`;

  // lo que se arrastra de los meses anteriores
  const antes = acumuladoHasta(estado.mes, { incluir: false });
  const arr = $('#arrastre');
  if (antes !== 0) {
    arr.hidden = false;
    $('#arr-antes').textContent = clp(antes);
    $('#arr-antes').className = antes < 0 ? 'negativo' : '';
    const total = antes + saldo;
    $('#arr-total').textContent = clp(total);
    $('#arr-total').className = total < 0 ? 'negativo' : '';
  } else {
    arr.hidden = true;
  }

  $('#cifra-ingresos').textContent = clp(ti);
  $('#cifra-egresos').textContent  = clp(te);
  const difTxt = (real, ppto) => {
    if (!ppto) return '';
    const d = real - ppto;
    return `ppto ${clp(ppto)} · dif ${d >= 0 ? '+' : ''}${clp(d)}`;
  };
  $('#ppto-ingresos').textContent = difTxt(ti, sumP(ing));
  $('#ppto-egresos').textContent  = difTxt(te, sumP(egr));

  // egresos por categoría
  const porCat = new Map();
  for (const m of egr) porCat.set(m.categoria, (porCat.get(m.categoria) || 0) + m.monto);
  $('#gr-categorias').innerHTML = barrasRankeadas(
    [...porCat].map(([nombre, valor]) => ({ nombre, valor })));

  // gastado v/s presupuesto por categoría
  const metas = new Map();
  for (const m of egr) metas.set(m.categoria, (metas.get(m.categoria) || 0) + (m.presupuesto || 0));
  const todas = [...porCat]
    .map(([nombre, valor]) => ({ nombre, valor, meta: metas.get(nombre) || 0 }))
    .sort((a, b) => b.valor - a.valor);
  const conMeta = todas.filter(c => c.meta > 0);
  const sinMeta = todas.filter(c => c.meta === 0);
  $('#gr-presupuesto').innerHTML = bullet(conMeta) +
    (sinMeta.length
      ? `<p class="ayuda mini" style="margin-top:14px">Sin presupuesto asignado: ` +
        sinMeta.map(c => `${esc(c.nombre)} ${clp(c.valor)}`).join(' · ') + `</p>`
      : '');

  // proyección
  const porMes = new Map();
  for (const m of datos.movimientos) {
    const k = mesKey(m.fecha);
    if (!porMes.has(k)) porMes.set(k, { mes: k, ing: 0, egr: 0 });
    porMes.get(k)[m.tipo === 'Ingreso' ? 'ing' : 'egr'] += m.monto;
  }
  const serie = [...porMes.values()].sort((a, b) => mesOrden(a.mes).localeCompare(mesOrden(b.mes)));
  lineas($('#gr-proyeccion'), serie);

  pintarDetalle(movs);
  pintarFijosPendientes();
  pintarConceptosSugeridos();
}

/**
 * Pozo acumulado hasta un mes. Ignora las filas "Saldo mes anterior" que
 * venían de la planilla: son justamente este cálculo hecho a mano, y contarlas
 * sería sumar dos veces lo mismo.
 */
function acumuladoHasta(mes, { incluir = true } = {}) {
  const tope = mesOrden(mes);
  let total = 0;
  for (const m of datos.movimientos) {
    if (/saldo\s+mes\s+anterior/i.test(m.concepto)) continue;
    const o = mesOrden(mesKey(m.fecha));
    if (o > tope || (!incluir && o === tope)) continue;
    total += m.tipo === 'Ingreso' ? m.monto : -m.monto;
  }
  return total;
}

/* ---------- gastos fijos ---------- */

/** Los fijos que este mes todavía no tienen un movimiento con ese concepto. */
function fijosPendientes(mes) {
  const hechos = new Set(
    datos.movimientos.filter(m => mesKey(m.fecha) === mes)
      .map(m => m.concepto.trim().toLowerCase()));
  return datos.fijos.filter(f => !hechos.has(f.concepto.trim().toLowerCase()));
}

function pintarFijosPendientes() {
  const pend = fijosPendientes(estado.mes);
  const card = $('#tarjeta-fijos');
  card.hidden = !pend.length;
  if (!pend.length) return;

  $('#fijos-pendientes').innerHTML = pend.map(f => `
    <div class="item fijo" data-id="${f.id}">
      <div class="cuerpo">
        <strong>${esc(f.concepto)}</strong>
        <small>${esc(f.categoria)} · día ${f.dia}${f.monto ? ` · suele ser ${clp(f.monto)}` : ''}</small>
      </div>
      <button class="secundario chico" data-op="anotar">Anotar</button>
    </div>`).join('');

  $('#fijos-pendientes').querySelectorAll('.fijo').forEach(el => {
    const f = datos.fijos.find(x => x.id === el.dataset.id);
    el.querySelector('[data-op="anotar"]').onclick = () => {
      prepararForm({
        tipo: f.tipo || 'Egreso',
        categoria: f.categoria,
        concepto: f.concepto,
        monto: f.monto || 0,
        presupuesto: f.monto || null,
        fecha: diaDelMes(estado.mes, f.dia),
      });
      $('#f-id').value = '';          // es uno nuevo, no una edición
      estado.editando = null;
      $('#f-monto').value = f.monto ? f.monto.toLocaleString('es-CL') : '';
      $('#btn-cancelar').hidden = true;
      $('#titulo-form').textContent = `Anotar ${f.concepto}`;
      $('#btn-guardar').textContent = 'Guardar';
      mostrar('registrar');
      modoRegistro('uno');
      $('#f-monto').focus();
      $('#f-monto').select?.();
    };
  });
}

function pintarFijos() {
  const cont = $('#lista-fijos');
  if (!datos.fijos.length) {
    cont.innerHTML = '<p class="vacio">Todavía no hay fijos. Agrega la luz, el agua, el celular…</p>';
    return;
  }
  cont.innerHTML = datos.fijos.map(f => `
    <div class="fila-ppto" data-id="${f.id}">
      <span>${esc(f.concepto)}<br><small class="ayuda mini">${esc(f.categoria)} · día ${f.dia}</small></span>
      <span class="num" style="flex:none;font-variant-numeric:tabular-nums">${f.monto ? clp(f.monto) : '—'}</span>
      <button class="icono-btn chico" data-op="borrar" aria-label="Borrar">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`).join('');

  cont.querySelectorAll('.fila-ppto').forEach(el => {
    el.querySelector('[data-op="borrar"]').onclick = async () => {
      const f = datos.fijos.find(x => x.id === el.dataset.id);
      await datos.borrarFijo(f.id);
      pintarFijos();
      aviso(`Quitado de los fijos: ${f.concepto}`, {
        accion: 'Deshacer',
        alPulsar: async () => { await datos.guardarFijo(f); pintarFijos(); },
      });
    };
  });
}

function pintarDetalle(movs) {
  const cont = $('#detalle-conceptos');
  if (!movs.length) { cont.innerHTML = '<p class="vacio">Nada que mostrar.</p>'; return; }

  const grupos = new Map();
  for (const m of movs) {
    const g = `${m.tipo}|${m.categoria}`;
    if (!grupos.has(g)) grupos.set(g, new Map());
    const c = grupos.get(g);
    c.set(m.concepto, (c.get(m.concepto) || 0) + m.monto);
  }
  const orden = [...grupos].sort((a, b) => a[0].localeCompare(b[0]));

  cont.innerHTML = orden.map(([g, conceptos]) => {
    const [tipo, cat] = g.split('|');
    const total = [...conceptos.values()].reduce((s, v) => s + v, 0);
    const filas = [...conceptos].sort((a, b) => b[1] - a[1]);
    return `<div class="grupo-cat">
      <h4>${esc(cat)} <small>(${tipo.toLowerCase()})</small><span>${clp(total)}</span></h4>
      <table><tbody>${filas.map(([c, v]) =>
        `<tr><td>${esc(c)}</td><td class="num">${clp(v)}</td></tr>`).join('')}</tbody></table>
    </div>`;
  }).join('');
}

function pintarHistorial() {
  const mes = $('#hist-mes').value || estado.mes;
  const todos = mes === TODOS;
  const q = $('#hist-buscar').value.trim().toLowerCase();
  let movs = todos ? [...datos.movimientos] : delMes(mes);
  if (q) movs = movs.filter(m =>
    m.concepto.toLowerCase().includes(q) || m.categoria.toLowerCase().includes(q));
  movs.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // total de lo que quedó a la vista: "¿cuánto llevamos en X?"
  const tot = $('#hist-total');
  if (q || todos) {
    const ing = movs.filter(m => m.tipo === 'Ingreso').reduce((s, m) => s + m.monto, 0);
    const egr = movs.filter(m => m.tipo === 'Egreso').reduce((s, m) => s + m.monto, 0);
    const partes = [`${movs.length} movimiento${movs.length === 1 ? '' : 's'}`];
    if (egr) partes.push(`egresos ${clp(egr)}`);
    if (ing) partes.push(`ingresos ${clp(ing)}`);
    tot.textContent = partes.join(' · ');
    tot.hidden = false;
  } else {
    tot.hidden = true;
  }

  const cont = $('#lista-historial');
  if (!movs.length) { cont.innerHTML = '<p class="vacio">Sin movimientos.</p>'; return; }

  let html = '', dia = null;
  for (const m of movs) {
    if (m.fecha !== dia) { dia = m.fecha; html += `<p class="dia-sep">${esc(fechaCorta(dia))}</p>`; }
    const ing = m.tipo === 'Ingreso';
    html += `<div class="mov" data-id="${m.id}">
      <div class="txt">
        <strong>${esc(m.concepto)}</strong>
        <small>${esc(m.categoria)}${m.presupuesto ? ` · ppto ${clp(m.presupuesto)}` : ''}</small>
      </div>
      <div class="val ${ing ? 'ing' : ''}">${ing ? '+' : '−'}${clp(m.monto)}</div>
      <div class="acciones-mov">
        <button data-op="editar" aria-label="Editar">
          <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button data-op="borrar" aria-label="Borrar">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
    </div>`;
  }
  cont.innerHTML = html;

  cont.querySelectorAll('.mov').forEach(el => {
    const m = datos.movimientos.find(x => x.id === el.dataset.id);
    el.querySelector('[data-op="editar"]').onclick = () => editar(m);
    el.querySelector('[data-op="borrar"]').onclick = async () => {
      const copia = { ...m };
      await datos.borrar(m.id);
      pintarHistorial();
      aviso(`Borrado: ${copia.concepto}`, {
        accion: 'Deshacer',
        alPulsar: async () => {
          await datos.agregar(copia);
          pintarTodo();
          aviso('Listo, volvió.');
        },
      });
    };
  });
}

function pintarPresupuestos() {
  const cont = $('#lista-ppto');
  cont.innerHTML = datos.presupuestos.map(p => `
    <div class="fila-ppto" data-id="${p.id}">
      <span>${esc(p.clasificacion)}${p.comentario ? `<br><small class="ayuda mini">${esc(p.comentario)}</small>` : ''}</span>
      <input type="text" inputmode="numeric" value="${p.monto.toLocaleString('es-CL')}">
      <button class="icono-btn chico" data-op="borrar" aria-label="Borrar">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>`).join('');

  cont.querySelectorAll('.fila-ppto').forEach(el => {
    const p = datos.presupuestos.find(x => x.id === el.dataset.id);
    const input = el.querySelector('input');
    input.onchange = async () => {
      const v = aNumero(input.value);
      if (v == null) { input.value = p.monto.toLocaleString('es-CL'); return; }
      await datos.guardarPpto({ ...p, monto: v });
      aviso('Presupuesto actualizado.');
    };
    el.querySelector('[data-op="borrar"]').onclick = async () => {
      await datos.borrarPpto(p.id);
      pintarPresupuestos();
    };
  });

  const total = datos.presupuestos.reduce((s, p) => s + p.monto, 0);
  cont.insertAdjacentHTML('beforeend',
    `<div class="fila-ppto"><span><b>Total</b></span>
     <span class="num" style="flex:none;font-variant-numeric:tabular-nums"><b>${clp(total)}</b></span>
     <span style="width:40px"></span></div>`);
}

/* ================== listas ================== */

function pintarLista() {
  $$('#seg-lista .seg').forEach(b => b.classList.toggle('activo', b.dataset.lista === estado.lista));
  $('#bloque-Falta').hidden = estado.lista !== 'Falta';
  $('#bloque-Deseo').hidden = estado.lista !== 'Deseo';
  if (estado.lista === 'Falta') pintarFalta(); else pintarDeseos();
  pintarGlobo();
}

function itemHTML(i, { precio = false } = {}) {
  const extra = precio
    ? (i.precio ? `<span class="precio">${clp(i.precio)}</span>` : '')
    : '';
  const bajo = precio
    ? (i.nota ? `<small>${esc(i.nota)}</small>` : '')
    : (i.lugar ? `<small>${esc(i.lugar)}</small>` : '');
  return `<div class="item${i.listo ? ' listo' : ''}" data-id="${i.id}">
    <button class="tic" data-op="tic" aria-label="${i.listo ? 'Desmarcar' : 'Marcar'}"
            aria-pressed="${i.listo}">${ICONO_TIC}</button>
    <div class="cuerpo"><strong>${esc(i.nombre)}</strong>${bajo}</div>
    ${extra}
    <button class="quitar" data-op="quitar" aria-label="Quitar">${ICONO_QUITA}</button>
  </div>`;
}

function conectarItems(cont, despues) {
  cont.querySelectorAll('.item').forEach(el => {
    const it = datos.lista.find(x => x.id === el.dataset.id);
    if (!it) return;
    el.querySelector('[data-op="tic"]').onclick = async () => {
      await datos.editarItem({ id: it.id, listo: !it.listo });
      despues();
    };
    el.querySelector('[data-op="quitar"]').onclick = async () => {
      const copia = { ...it };
      await datos.borrarItem(it.id);
      despues();
      aviso(`Quitado: ${copia.nombre}`, {
        accion: 'Deshacer',
        alPulsar: async () => { await datos.restaurarItem(copia); despues(); },
      });
    };
  });
}

function pintarFalta() {
  // chips del lugar para el ítem nuevo
  $('#chips-lugar').innerHTML = LUGARES.map(l =>
    `<button type="button" class="chip${l === estado.lugarNuevo ? ' activo' : ''}" data-lugar="${esc(l)}">${esc(l)}</button>`).join('');
  $('#chips-lugar').querySelectorAll('.chip').forEach(b => b.onclick = () => {
    estado.lugarNuevo = b.dataset.lugar;
    pintarFalta();
  });

  const todos = datos.lista.filter(i => i.tipo === 'Falta');
  const pendientes = todos.filter(i => !i.listo);
  const listos = todos.filter(i => i.listo);

  // filtros: solo los lugares que tienen algo pendiente
  const usados = LUGARES.filter(l => pendientes.some(i => i.lugar === l));
  const filtros = ['Todo', ...usados];
  if (!filtros.includes(estado.filtroLugar)) estado.filtroLugar = 'Todo';
  $('#filtros-lugar').innerHTML = usados.length > 1
    ? filtros.map(l => {
        const n = l === 'Todo' ? pendientes.length : pendientes.filter(i => i.lugar === l).length;
        return `<button type="button" class="chip${l === estado.filtroLugar ? ' activo' : ''}" data-f="${esc(l)}">${esc(l)} ${n}</button>`;
      }).join('')
    : '';
  $('#filtros-lugar').querySelectorAll('.chip').forEach(b => b.onclick = () => {
    estado.filtroLugar = b.dataset.f;
    pintarFalta();
  });

  const visibles = estado.filtroLugar === 'Todo'
    ? pendientes : pendientes.filter(i => i.lugar === estado.filtroLugar);

  const cont = $('#items-falta');
  cont.innerHTML =
    (visibles.length
      ? visibles.map(i => itemHTML(i)).join('')
      : `<p class="vacio">${todos.length ? 'Nada pendiente acá.' : 'No falta nada… por ahora.'}</p>`) +
    (listos.length
      ? `<div class="sub-lista"><h4>Ya en el carro (${listos.length})</h4>
           <button type="button" id="btn-vaciar">Vaciar</button></div>` +
        listos.map(i => itemHTML(i)).join('')
      : '');

  conectarItems(cont, pintarFalta);
  const vaciar = $('#btn-vaciar');
  if (vaciar) vaciar.onclick = async () => {
    const n = await datos.limpiarListos('Falta');
    pintarFalta();
    aviso(`${n} cosa${n === 1 ? '' : 's'} fuera de la lista.`);
  };
}

function pintarDeseos() {
  const todos = datos.lista.filter(i => i.tipo === 'Deseo');
  const pendientes = todos.filter(i => !i.listo);
  const listos = todos.filter(i => i.listo);
  const estimado = pendientes.reduce((s, i) => s + (i.precio || 0), 0);

  const cont = $('#items-deseo');
  cont.innerHTML =
    (estimado
      ? `<div class="resumen-deseos"><span>${pendientes.length} cosa${pendientes.length === 1 ? '' : 's'} en la mira</span>
           <span>≈ <b>${clp(estimado)}</b></span></div>`
      : '') +
    (pendientes.length
      ? pendientes.map(i => itemHTML(i, { precio: true })).join('')
      : '<p class="vacio">Todavía no hay nada anotado.</p>') +
    (listos.length
      ? `<div class="sub-lista"><h4>Ya lo tenemos (${listos.length})</h4>
           <button type="button" id="btn-vaciar-deseos">Vaciar</button></div>` +
        listos.map(i => itemHTML(i, { precio: true })).join('')
      : '');

  conectarItems(cont, pintarDeseos);
  const vaciar = $('#btn-vaciar-deseos');
  if (vaciar) vaciar.onclick = async () => {
    await datos.limpiarListos('Deseo');
    pintarDeseos();
  };
}

function pintarGlobo() {
  const n = datos.lista.filter(i => i.tipo === 'Falta' && !i.listo).length;
  const g = $('#globo-lista');
  g.textContent = n > 99 ? '99+' : n;
  g.hidden = n === 0;
}

function pintarAjustes() {
  $('#ajustes-sesion').textContent = datos.usuario
    ? `Sesión iniciada como ${datos.usuario.email}.`
    : 'Modo local: los datos viven solo en este dispositivo.';
  $('#btn-salir').hidden = !datos.usuario;
  $$('#seg-tema .seg').forEach(b =>
    b.classList.toggle('activo', b.dataset.tema === (localStorage.getItem('bl.tema') || 'dark')));
  pintarEstado();
}

function pintarEstado() {
  const n = datos.cola.length;
  const txt = !datos.configurado ? 'solo en este dispositivo'
    : !datos.usuario ? 'modo local'
    : !navigator.onLine ? 'sin conexión'
    : n ? `${n} por subir`
    : 'sincronizado';
  $('#sub-estado').textContent = txt;
  const e = $('#estado-sync');
  if (e) e.textContent = !datos.configurado
    ? 'Supabase no está configurado: la app guarda todo en este dispositivo.'
    : n ? `Hay ${n} cambio(s) esperando conexión.` : 'Todo sincronizado.';
}

function pintarConceptosSugeridos() {
  const vistos = [...new Set(datos.movimientos.map(m => m.concepto))].sort();
  $('#lista-conceptos').innerHTML = vistos.map(c => `<option value="${esc(c)}">`).join('');
}

/* ================== formulario ================== */

function prepararForm(mov) {
  estado.editando = mov?.id ?? null;
  estado.tipo = mov?.tipo ?? 'Egreso';
  estado.categoria = mov?.categoria ?? CATEGORIAS[estado.tipo][0];
  $('#titulo-form').textContent = mov ? 'Editar movimiento' : 'Nuevo movimiento';
  $('#btn-guardar').textContent = mov ? 'Guardar cambios' : 'Guardar';
  $('#btn-cancelar').hidden = !mov;
  $('#f-id').value = mov?.id ?? '';
  $('#f-monto').value = mov ? mov.monto.toLocaleString('es-CL') : '';
  $('#f-concepto').value = mov?.concepto ?? '';
  $('#f-fecha').value = mov?.fecha ?? hoyISO();
  $('#f-ppto').value = mov?.presupuesto ? mov.presupuesto.toLocaleString('es-CL') : '';
  $$('#form-mov .seg').forEach(b => b.classList.toggle('activo', b.dataset.tipo === estado.tipo));
  pintarChips();
}

/* ---------- pegar varios ---------- */

function modoRegistro(modo) {
  estado.modoRegistro = modo;
  $$('#seg-registro .seg').forEach(b => b.classList.toggle('activo', b.dataset.modo === modo));
  $('#form-mov').hidden = modo !== 'uno';
  $('#bloque-varios').hidden = modo !== 'varios';
  if (modo === 'varios' && !$('#v-fecha').value) $('#v-fecha').value = hoyISO();
}

function leerPegado() {
  const fecha = $('#v-fecha').value || hoyISO();
  const { movimientos, ignoradas } = parsear($('#v-texto').value, fecha);
  estado.previo = movimientos;
  estado.ignoradas = ignoradas;
  pintarPrevio();
  if (!movimientos.length) aviso('No encontré montos en ese texto.');
}

function pintarPrevio() {
  const cont = $('#v-previo');
  if (!estado.previo.length) { cont.innerHTML = ''; return; }

  const opciones = tipo => CATEGORIAS[tipo]
    .map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  cont.innerHTML = `
    <div class="tarjeta">
      <h3>Esto entendí — revísalo antes de guardar</h3>
      <div class="previos">
        ${estado.previo.map((m, i) => `
          <div class="previo" data-i="${i}">
            <div class="previo-fila">
              <input class="p-concepto" value="${esc(m.concepto)}" aria-label="Concepto">
              <input class="p-monto" inputmode="numeric" aria-label="Monto"
                     value="${m.monto.toLocaleString('es-CL')}">
              <button type="button" class="quitar" data-op="quitar" aria-label="Descartar">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="previo-fila chica">
              <select class="p-tipo" aria-label="Tipo">
                <option value="Egreso"${m.tipo === 'Egreso' ? ' selected' : ''}>Egreso</option>
                <option value="Ingreso"${m.tipo === 'Ingreso' ? ' selected' : ''}>Ingreso</option>
              </select>
              <select class="p-cat" aria-label="Categoría">${opciones(m.tipo)}</select>
            </div>
          </div>`).join('')}
      </div>
      ${estado.ignoradas.length ? `<p class="ayuda mini" style="margin-top:12px">
        Sin monto, así que las dejé fuera: ${estado.ignoradas.map(esc).join(' · ')}</p>` : ''}
      <div class="acciones">
        <button class="primario" type="button" id="btn-guardar-varios">
          Guardar ${estado.previo.length} movimiento${estado.previo.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>`;

  cont.querySelectorAll('.previo').forEach(el => {
    const i = Number(el.dataset.i);
    const cat = el.querySelector('.p-cat');
    cat.value = estado.previo[i].categoria;

    el.querySelector('.p-concepto').oninput = ev => {
      estado.previo[i].concepto = ev.target.value;
    };
    el.querySelector('.p-monto').oninput = ev => {
      formatearMiles(ev.target);
      estado.previo[i].monto = aNumero(ev.target.value) || 0;
    };
    el.querySelector('.p-tipo').onchange = ev => {
      const t = ev.target.value;
      estado.previo[i].tipo = t;
      estado.previo[i].categoria = categoriaDe(estado.previo[i].concepto, t);
      cat.innerHTML = opciones(t);
      cat.value = estado.previo[i].categoria;
    };
    cat.onchange = ev => { estado.previo[i].categoria = ev.target.value; };
    el.querySelector('[data-op="quitar"]').onclick = () => {
      estado.previo.splice(i, 1);
      pintarPrevio();
    };
  });

  $('#btn-guardar-varios').onclick = guardarVarios;
}

async function guardarVarios() {
  const filas = estado.previo
    .filter(m => m.monto > 0 && m.concepto.trim())
    .map(({ fecha, tipo, categoria, concepto, monto }) =>
      ({ fecha, tipo, categoria, concepto: concepto.trim(), presupuesto: null, monto }));
  if (!filas.length) { aviso('No hay nada que guardar.'); return; }

  const btn = $('#btn-guardar-varios');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const n = await datos.importar(filas);
    estado.previo = []; estado.ignoradas = [];
    $('#v-texto').value = '';
    pintarPrevio();
    estado.mes = mesKey(filas[0].fecha);
    pintarResumen();
    mostrar('resumen');
    aviso(n === filas.length
      ? `${n} movimiento${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'}.`
      : `${n} guardado${n === 1 ? '' : 's'}; ${filas.length - n} ya estaban.`);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = `Guardar ${filas.length} movimientos`;
    aviso('No se pudo guardar. Revisa la conexión.');
  }
}

function pintarChips() {
  const cont = $('#chips-categoria');
  const cats = CATEGORIAS[estado.tipo];
  if (!cats.includes(estado.categoria)) estado.categoria = cats[0];
  cont.innerHTML = cats.map(c =>
    `<button type="button" class="chip${c === estado.categoria ? ' activo' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  cont.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    estado.categoria = b.dataset.cat;
    pintarChips();
  });
}

function editar(mov) {
  prepararForm(mov);
  mostrar('registrar');
}

async function guardarMovimiento(ev) {
  ev.preventDefault();
  const monto = aNumero($('#f-monto').value);
  if (!monto || monto <= 0) { aviso('Falta el monto.'); return; }
  const fila = {
    fecha: $('#f-fecha').value,
    tipo: estado.tipo,
    categoria: estado.categoria,
    concepto: $('#f-concepto').value.trim(),
    presupuesto: aNumero($('#f-ppto').value),
    monto,
  };
  if (estado.editando) {
    await datos.editar({ ...fila, id: estado.editando });
    aviso('Cambios guardados.');
  } else {
    await datos.agregar(fila);
    aviso(`${fila.tipo} de ${clp(monto)} registrado.`);
  }
  estado.mes = mesKey(fila.fecha);
  prepararForm();
  pintarResumen();
  mostrar('resumen');
}

function formatearMiles(input) {
  const pos = input.selectionStart;
  const largoAntes = input.value.length;
  const n = input.value.replace(/\D/g, '');
  input.value = n ? Number(n).toLocaleString('es-CL') : '';
  const delta = input.value.length - largoAntes;
  try { input.setSelectionRange(pos + delta, pos + delta); } catch {}
}

/* ================== histórico ================== */

async function importarHistorico() {
  const est = $('#import-estado');
  est.textContent = 'Cargando…';
  try {
    const filas = await (await fetch('datos/historico.json')).json();
    const n = await datos.importar(filas);
    est.textContent = n
      ? `Listo: ${n} movimientos importados.`
      : 'Ya estaban todos cargados.';
    pintarResumen();
  } catch (e) {
    est.textContent = 'No se pudo importar el histórico.';
  }
}

/* ================== varios ================== */

function aplicarTema(t) {
  localStorage.setItem('bl.tema', t);
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $$('#seg-tema .seg').forEach(b => b.classList.toggle('activo', b.dataset.tema === t));
}

let avisoTimer;
/** aviso('Listo') o aviso('Borrado', { accion: 'Deshacer', alPulsar: fn }) */
function aviso(txt, { accion, alPulsar, ms } = {}) {
  const el = $('#aviso');
  el.innerHTML = `<span>${esc(txt)}</span>`;
  if (accion) {
    const b = document.createElement('button');
    b.className = 'aviso-accion';
    b.textContent = accion;
    b.onclick = () => { el.hidden = true; clearTimeout(avisoTimer); alPulsar?.(); };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, ms ?? (accion ? 6000 : 2600));
}
