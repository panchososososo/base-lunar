// ============ secciones del supermercado ============
// Asigna cada ítem de "Falta comprar" a una sección del súper y guarda el
// recorrido (orden), las secciones ocultas y las correcciones hechas a mano.
// Todo esto vive en el teléfono (localStorage); la sección elegida a mano
// además se guarda en la columna `seccion` de la tabla `lista`.

export const OTROS = 'Otros';

// Recorrido típico de Líder
export const SECCIONES = [
  'Frutas y verduras',
  'Carnes',
  'Lácteos y refrigerados',
  'Despensa',
  'Snacks y galletas',
  'Licores',
  'Hogar y desechables',
  'Higiene personal',
  'Juguetería y librería',
];

const K_ORDEN     = 'bl.secciones.orden';
const K_OCULTAS   = 'bl.secciones.ocultas';
const K_APRENDIDO = 'bl.secciones.aprendido';

const leer = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
  catch { return def; }
};
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------- normalización ----------
const sinTildes = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto limpio: sin tildes, minúsculas, solo letras/números y espacios simples. */
export function limpio(t) {
  return sinTildes(t).replace(/[^a-z0-9ñ]+/g, ' ').trim();
}

/** Quita el plural: "limones" → "limon", "papas" → "papa". */
function singular(w) {
  if (w.length > 4 && /[^aeiou]es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Raíz para comparar: singular, sin diminutivo y sin la vocal final.
 *  "galletitas" → "gallet", "sopitas" → "sop", "quesito" → "ques". */
function raiz(w) {
  let r = singular(w);
  const m = r.match(/^(.{3,}?)(cit[oa]|it[oa]|ill[oa])$/);
  if (m) r = m[1];
  return r.replace(/[aeiou]$/, '');
}

/** Clave para detectar repetidos y recordar correcciones: "Papitas " → "papita". */
export function clave(nombre) {
  return limpio(nombre).split(' ').map(singular).join(' ');
}

// ---------- reglas ----------
// Frases de varias palabras: se buscan primero en el nombre completo.
const FRASES = [
  ['Higiene personal',      ['pasta de dientes', 'pasta dental', 'crema dental', 'toalla higienica',
                             'toallas higienicas', 'toallas humedas', 'toallitas humedas',
                             'hilo dental', 'maquina de afeitar', 'crema corporal']],
  ['Hogar y desechables',   ['papel higienico', 'toalla nova', 'toalla de papel', 'papel aluminio',
                             'papel alusa', 'bolsas de basura', 'bolsa de basura']],
  ['Snacks y galletas',     ['papas fritas', 'frutos secos', 'mani salado']],
  ['Despensa',              ['leche condensada', 'leche en polvo', 'agua mineral', 'crema de leche',
                             'salsa de tomate', 'pure de papa']],
  ['Frutas y verduras',     ['poroto verde', 'porotos verdes']],
  ['Juguetería y librería', ['papel lustre', 'cinta adhesiva']],
];

// Palabras que la regla general confunde (se comparan en singular, con diminutivo).
const EXCEPCIONES = {
  cevechita: 'Licores', cevecha: 'Licores', chela: 'Licores', chelita: 'Licores',
  papita: 'Snacks y galletas',          // "papitas" = papas fritas de bolsa
  sufle: 'Snacks y galletas', suflito: 'Snacks y galletas',
  sopita: 'Despensa',                   // sopa instantánea
  te: 'Despensa',
};

// Palabras sueltas: se comparan por raíz, así "galletitas" calza con "galleta".
const PALABRAS = [
  ['Frutas y verduras', `manzana platano pera naranja limon palta tomate lechuga cebolla cebollin ajo
    zanahoria papa zapallo zapallito pepino pimenton choclo brocoli coliflor espinaca acelga apio
    cilantro perejil frutilla uva kiwi durazno ciruela mandarina sandia melon pina arandano frambuesa
    champinon betarraga fruta verdura ensalada repollo berenjena camote jengibre mango damasco cereza
    guinda nectarin albahaca rucula`],
  ['Carnes', `carne pollo pechuga trutro vacuno cerdo chuleta costilla lomo posta molida hamburguesa
    vienesa salchicha longaniza chorizo pescado salmon merluza reineta camaron marisco pavo filete
    asado tocino prieta ceviche choripan carnicero abastero sobrecostilla`],
  ['Lácteos y refrigerados', `leche yogur yogurt yoghurt queso quesillo mantequilla margarina crema
    huevo jamon salame fiambre postre flan kefir ricota helado congelado nugget pizza empanada
    manjarate`],
  ['Despensa', `arroz fideo tallarin spaghetti pasta harina azucar sal aceite vinagre atun jurel
    conserva lata salsa ketchup mayonesa mostaza cafe mate avena cereal legumbre lenteja poroto
    garbanzo sopa caldo pan tortilla fajita mermelada manjar miel especia oregano comino pimienta
    merken levadura bebida jugo agua endulzante stevia pure`],
  ['Snacks y galletas', `galleta snack ramita chocolate dulce caramelo chicle mani almendra nuez nueces
    cabrita palomita dorito barra alfajor queque golosina gomita super8 triton cheeto pretzel`],
  ['Licores', `cerveza vino pisco ron whisky vodka gin licor espumante champana fernet tequila aperol
    ramazzotti sidra`],
  ['Hogar y desechables', `vaso plato servilleta nova bolsa detergente cloro lavaloza quix esponja
    virutilla limpiador cif lysoform desinfectante escoba trapero ampolleta pila foil alusa film
    encendedor fosforo vela carbon suavizante tenedor cuchara cuchillo bombilla mantel insecticida
    raid desechable plastico confort`],
  ['Higiene personal', `shampoo champu acondicionador jabon cepillo desodorante tampon protector
    afeitar gillette algodon cotonito enjuague colgate perfume preservativo condon panal toallita`],
  ['Juguetería y librería', `juguete cuaderno lapiz lapices plumon destacador cartulina pegamento
    tijera regalo globo pelota block carpeta scotch puzzle libro`],
];

const POR_RAIZ = new Map();
for (const [sec, txt] of PALABRAS) {
  for (const p of txt.split(/\s+/).filter(Boolean)) {
    const r = raiz(p);
    if (!POR_RAIZ.has(r)) POR_RAIZ.set(r, sec);   // la primera sección gana
  }
}

/** Sección según el nombre, solo con reglas (sin lo aprendido). */
export function seccionPorReglas(nombre) {
  const t = ` ${limpio(nombre)} `;
  for (const [sec, frases] of FRASES) {
    if (frases.some(f => t.includes(` ${f} `))) return sec;
  }
  const palabras = t.trim().split(' ').filter(Boolean);
  for (const w of palabras) {
    const s = singular(w);
    if (EXCEPCIONES[s]) return EXCEPCIONES[s];
    const sec = POR_RAIZ.get(raiz(w));
    if (sec) return sec;
  }
  return OTROS;
}

// ---------- lo que se corrigió a mano ----------
let aprendido = leer(K_APRENDIDO, {});

/** Recuerda la sección elegida para este nombre (y sus variantes). */
export function aprender(nombre, seccion) {
  const k = clave(nombre);
  if (!k) return;
  if (!seccion || seccion === seccionPorReglas(nombre)) delete aprendido[k];
  else aprendido[k] = seccion;
  guardar(K_APRENDIDO, aprendido);
}

/** Sección sugerida para un nombre nuevo: lo aprendido manda sobre las reglas. */
export function seccionDe(nombre) {
  return aprendido[clave(nombre)] || seccionPorReglas(nombre);
}

/** Sección de un ítem: la guardada en la fila o, si no tiene, la sugerida. */
export function seccionDeItem(item) {
  const s = item?.seccion;
  return s && (SECCIONES.includes(s) || s === OTROS) ? s : seccionDe(item?.nombre);
}

// ---------- recorrido y secciones ocultas ----------
/** Orden actual del recorrido (siempre incluye todas; "Otros" va al final). */
export function orden() {
  const guardado = leer(K_ORDEN, null);
  const base = Array.isArray(guardado) ? guardado.filter(s => SECCIONES.includes(s)) : [];
  return [...base, ...SECCIONES.filter(s => !base.includes(s))];
}

export function mover(seccion, paso) {
  const o = orden();
  const i = o.indexOf(seccion);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= o.length) return o;
  [o[i], o[j]] = [o[j], o[i]];
  guardar(K_ORDEN, o);
  return o;
}

export function restablecerOrden() {
  try { localStorage.removeItem(K_ORDEN); } catch {}
  return orden();
}

export function ocultas() {
  return new Set(leer(K_OCULTAS, []));
}

export function alternarOculta(seccion) {
  const s = ocultas();
  if (s.has(seccion)) s.delete(seccion); else s.add(seccion);
  guardar(K_OCULTAS, [...s]);
  return s;
}

export function mostrarTodas() {
  guardar(K_OCULTAS, []);
}
