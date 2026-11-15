// ============ capa de datos: Supabase + caché local + cola offline ============
import { uid, slug } from './util.js';

const K_MOV   = 'bl.movimientos';
const K_PPTO  = 'bl.presupuestos';
const K_LISTA = 'bl.lista';
const K_FIJOS = 'bl.fijos';
const K_COMPRAS = 'bl.compras';
const K_COLA  = 'bl.cola';
const K_LOCAL = 'bl.modoLocal';

export const LUGARES = ['Súper', 'Feria', 'Chinos', 'Otro'];

const PPTO_INICIAL = [
  { id: uid(), clasificacion: 'Carnes',                       monto: 70000,  comentario: 'Idealmente 9 kilos al mes' },
  { id: uid(), clasificacion: 'Aseo',                         monto: 60000,  comentario: '' },
  { id: uid(), clasificacion: 'Feria',                        monto: 60000,  comentario: '$15.000 semanales' },
  { id: uid(), clasificacion: 'Lácteos, Huevos (Desayunos)',  monto: 50000,  comentario: '' },
  { id: uid(), clasificacion: 'Despensa básica',              monto: 60000,  comentario: 'Carbohidratos, etc.' },
  { id: uid(), clasificacion: 'Deudas',                       monto: 100000, comentario: 'Ojalá no superar' },
  { id: uid(), clasificacion: 'Servicios',                    monto: 60000,  comentario: 'Luz y agua' },
];

const leer = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
  catch { return def; }
};
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Si la tabla `lista` todavía no tiene la columna `seccion`, se deja de mandar.
let SIN_COLUMNA_SECCION = false;
const faltaSeccion = e => /seccion/i.test(e?.message || '');
const sinSeccion = fila => {
  if (!SIN_COLUMNA_SECCION || !fila || !('seccion' in fila)) return fila;
  const { seccion, ...resto } = fila;
  return resto;
};

export const datos = {
  sb: null,            // cliente supabase
  usuario: null,
  modoLocal: leer(K_LOCAL, false),
  movimientos: leer(K_MOV, []),
  presupuestos: leer(K_PPTO, PPTO_INICIAL),
  lista: leer(K_LISTA, []),
  fijos: leer(K_FIJOS, []),
  compras: leer(K_COMPRAS, []),
  cola: leer(K_COLA, []),
  alCambiar: () => {},
  alEstado: () => {},

  get configurado() {
    const c = globalThis.CONFIG || {};
    return Boolean(c.SUPABASE_URL && c.SUPABASE_ANON_KEY &&
                   !c.SUPABASE_URL.includes('TU-PROYECTO') &&
                   !c.SUPABASE_ANON_KEY.includes('TU-ANON-KEY'));
  },

  // ---------- arranque ----------
  async iniciar() {
    if (!this.configurado) return null;
    const { createClient } = await import(
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm');
    this.sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const { data } = await this.sb.auth.getSession();
    this.usuario = data?.session?.user ?? null;
    this.sb.auth.onAuthStateChange((_e, s) => { this.usuario = s?.user ?? null; });
    return this.usuario;
  },

  async entrar(email, clave) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password: clave });
    if (error) throw error;
    this.usuario = data.user;
    this.modoLocal = false; guardar(K_LOCAL, false);
    return data.user;
  },

  async salir() {
    if (this.sb) await this.sb.auth.signOut();
    this.usuario = null;
    this.modoLocal = false; guardar(K_LOCAL, false);
  },

  usarLocal() { this.modoLocal = true; guardar(K_LOCAL, true); },

  get enLinea() { return Boolean(this.sb && this.usuario && navigator.onLine); },

  // ---------- sincronización ----------
  async sincronizar() {
    if (!this.sb || !this.usuario) return;
    await this.vaciarCola();
    const [mov, ppto, lista, fijos, compras] = await Promise.all([
      this.sb.from('movimientos').select('*').order('fecha', { ascending: false }),
      this.sb.from('presupuestos').select('*').order('clasificacion'),
      this.sb.from('lista').select('*').order('creado_en', { ascending: true }),
      this.sb.from('fijos').select('*').order('dia'),
      this.sb.from('compras').select('*').order('creado_en', { ascending: true }),
    ]);
    if (mov.error) throw mov.error;
    this.movimientos = mov.data.map(normalizar);
    guardar(K_MOV, this.movimientos);
    if (!ppto.error && ppto.data.length) {
      this.presupuestos = ppto.data;
      guardar(K_PPTO, this.presupuestos);
    }
    if (!lista.error) {
      this.lista = lista.data;
      guardar(K_LISTA, this.lista);
    }
    if (!fijos.error) {
      this.fijos = fijos.data.map(f => ({ ...f, monto: f.monto == null ? null : Number(f.monto) }));
      guardar(K_FIJOS, this.fijos);
    }
    if (!compras.error) {   // si la tabla aún no existe, se sigue con la copia local
      this.compras = compras.data.map(normalizarCompra);
      guardar(K_COMPRAS, this.compras);
    }
    this.alCambiar();
    this.alEstado();
  },

  escuchar() {
    if (!this.sb || !this.usuario) return;
    const refrescar = () => this.sincronizar().catch(() => {});
    this.sb.channel('bl-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lista' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, refrescar)
      .subscribe();
  },

  // Sube lo que quedó pendiente. Si algo falla NO se descarta: se deja en la
  // cola para el próximo intento (antes se perdía, porque supabase-js devuelve
  // el error en vez de lanzarlo y el `catch` nunca se ejecutaba).
  async vaciarCola() {
    if (!this.cola.length || !this.enLinea) return { subidos: 0, pendientes: this.cola.length };
    let subidos = 0;
    for (const t of [...this.cola]) {
      let error = null;
      try {
        const fila = t.tabla === 'lista' && t.fila ? sinSeccion(t.fila) : t.fila;
        if (t.op === 'insert') {
          ({ error } = await this.sb.from(t.tabla).upsert(fila));
        } else if (t.op === 'update') {
          ({ error } = await this.sb.from(t.tabla).update(fila).eq('id', fila.id));
        } else if (t.op === 'delete') {
          ({ error } = await this.sb.from(t.tabla).delete().eq('id', t.id));
        }
      } catch (e) { error = e; }

      if (error && t.tabla === 'lista' && faltaSeccion(error) && !SIN_COLUMNA_SECCION) {
        SIN_COLUMNA_SECCION = true;       // el próximo intento va sin `seccion`
        break;
      }
      if (error) {
        t.intentos = (t.intentos || 0) + 1;
        t.ultimoError = error.message || String(error);
        // Un error de permisos o de datos no se arregla reintentando para siempre
        if (t.intentos >= 5) this.cola = this.cola.filter(x => x !== t);
        else break;                       // el resto espera: mantiene el orden
      } else {
        this.cola = this.cola.filter(x => x !== t);
        subidos++;
      }
    }
    guardar(K_COLA, this.cola);
    this.alEstado();
    return { subidos, pendientes: this.cola.length };
  },

  encolar(t) {
    this.cola.push(t);
    guardar(K_COLA, this.cola);
    this.alEstado();
  },

  // ---------- movimientos ----------
  async agregar(mov) {
    const fila = { ...mov, id: mov.id || uid() };
    if (this.usuario) fila.creado_por = this.usuario.email;
    this.movimientos = [fila, ...this.movimientos];
    guardar(K_MOV, this.movimientos);
    this.alCambiar();
    if (this.enLinea) {
      const { error } = await this.sb.from('movimientos').insert(fila);
      if (error) this.encolar({ op: 'insert', tabla: 'movimientos', fila });
    } else if (this.sb && this.usuario) {
      this.encolar({ op: 'insert', tabla: 'movimientos', fila });
    }
    return fila;
  },

  async editar(fila) {
    this.movimientos = this.movimientos.map(m => (m.id === fila.id ? { ...m, ...fila } : m));
    guardar(K_MOV, this.movimientos);
    this.alCambiar();
    if (this.enLinea) {
      const { error } = await this.sb.from('movimientos').update(sinMeta(fila)).eq('id', fila.id);
      if (error) this.encolar({ op: 'update', tabla: 'movimientos', fila: sinMeta(fila) });
    } else if (this.sb && this.usuario) {
      this.encolar({ op: 'update', tabla: 'movimientos', fila: sinMeta(fila) });
    }
  },

  async borrar(id) {
    this.movimientos = this.movimientos.filter(m => m.id !== id);
    guardar(K_MOV, this.movimientos);
    this.alCambiar();
    if (this.enLinea) {
      const { error } = await this.sb.from('movimientos').delete().eq('id', id);
      if (error) this.encolar({ op: 'delete', tabla: 'movimientos', id });
    } else if (this.sb && this.usuario) {
      this.encolar({ op: 'delete', tabla: 'movimientos', id });
    }
  },

  /** Alta en lote (histórico o texto pegado), sin repetir lo que ya está. */
  async importar(filas) {
    // Primero traer lo que haya en el servidor: si el otro teléfono ya importó,
    // acá se ve y no se duplica.
    if (this.enLinea) { try { await this.sincronizar(); } catch {} }
    // Se compara solo contra lo que YA está guardado. Dos filas idénticas
    // dentro del mismo lote son legítimas: en septiembre hay dos ferias de
    // $20.000 el mismo día, y son dos ferias distintas.
    const existentes = new Set(this.movimientos.map(clave));
    const nuevas = filas
      .filter(f => !existentes.has(clave(f)))
      .map(f => ({ ...f, id: uid(), creado_por: this.usuario?.email ?? null }));
    if (!nuevas.length) return 0;
    this.movimientos = [...nuevas, ...this.movimientos];
    guardar(K_MOV, this.movimientos);
    this.alCambiar();
    if (this.enLinea) {
      for (let i = 0; i < nuevas.length; i += 200) {
        const { error } = await this.sb.from('movimientos').insert(nuevas.slice(i, i + 200));
        if (error) throw error;
      }
    }
    return nuevas.length;
  },

  /** Borra TODOS los movimientos. Solo se llama desde un botón que avisa. */
  async borrarTodos() {
    const n = this.movimientos.length;
    this.movimientos = [];
    guardar(K_MOV, this.movimientos);
    this.alCambiar();
    if (this.enLinea) {
      // el filtro es obligatorio en PostgREST: "todo lo que tenga fecha"
      const { error } = await this.sb.from('movimientos').delete().not('fecha', 'is', null);
      if (error) throw error;
    }
    return n;
  },

  // ---------- presupuestos ----------
  // Se identifican por `clasificacion`, no por el id local: así dos teléfonos
  // que todavía no sincronizan no terminan creando dos "Feria".
  async guardarPpto(fila) {
    const i = this.presupuestos.findIndex(
      p => p.id === fila.id || slug(p.clasificacion) === slug(fila.clasificacion));
    if (i >= 0) this.presupuestos[i] = { ...this.presupuestos[i], ...fila };
    else this.presupuestos.push({ ...fila, id: fila.id || uid() });
    guardar(K_PPTO, this.presupuestos);
    this.alCambiar();
    if (this.enLinea) {
      const { id, ...sinId } = fila;
      const { error } = await this.sb.from('presupuestos')
        .upsert(sinId, { onConflict: 'clasificacion' });
      if (error) this.encolar({ op: 'insert', tabla: 'presupuestos', fila: sinId });
    }
  },

  async borrarPpto(id) {
    this.presupuestos = this.presupuestos.filter(p => p.id !== id);
    guardar(K_PPTO, this.presupuestos);
    this.alCambiar();
    if (this.enLinea) await this.sb.from('presupuestos').delete().eq('id', id);
  },

  // ---------- lista de compras y deseos ----------
  async agregarItem({ tipo, nombre, lugar = null, precio = null, nota = null }) {
    const fila = {
      id: uid(), tipo, nombre, lugar, precio, nota,
      listo: false,
      creado_por: this.usuario?.email ?? null,
      creado_en: new Date().toISOString(),
    };
    this.lista = [...this.lista, fila];
    guardar(K_LISTA, this.lista);
    this.alCambiar();
    await this.subirLista('insert', fila);
    return fila;
  },

  async editarItem(fila) {
    this.lista = this.lista.map(i => (i.id === fila.id ? { ...i, ...fila } : i));
    guardar(K_LISTA, this.lista);
    this.alCambiar();
    await this.subirLista('update', this.lista.find(i => i.id === fila.id));
  },

  async borrarItem(id) {
    this.lista = this.lista.filter(i => i.id !== id);
    guardar(K_LISTA, this.lista);
    this.alCambiar();
    if (this.enLinea) {
      const { error } = await this.sb.from('lista').delete().eq('id', id);
      if (error) this.encolar({ op: 'delete', tabla: 'lista', id });
    } else if (this.sb && this.usuario) {
      this.encolar({ op: 'delete', tabla: 'lista', id });
    }
  },

  async limpiarListos(tipo) {
    const fuera = this.lista.filter(i => i.tipo === tipo && i.listo);
    if (!fuera.length) return 0;
    for (const i of fuera) await this.borrarItem(i.id);
    return fuera.length;
  },

  /** Vuelve a poner un item borrado, con su id original (para "deshacer"). */
  async restaurarItem(fila) {
    this.lista = [...this.lista.filter(i => i.id !== fila.id), fila]
      .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));
    guardar(K_LISTA, this.lista);
    this.alCambiar();
    await this.subirLista('insert', fila);
  },

  async subirLista(op, fila) {
    if (!fila) return;
    if (this.enLinea) {
      const enviar = f => (op === 'insert'
        ? this.sb.from('lista').insert(f)
        : this.sb.from('lista').update(f).eq('id', f.id));
      let { error } = await enviar(sinSeccion(fila));
      // Base sin la columna `seccion` (falta correr el esquema.sql nuevo):
      // se sube igual sin ella; la corrección queda recordada en el teléfono.
      if (error && faltaSeccion(error)) {
        SIN_COLUMNA_SECCION = true;
        ({ error } = await enviar(sinSeccion(fila)));
      }
      if (error) this.encolar({ op, tabla: 'lista', fila });
    } else if (this.sb && this.usuario) {
      this.encolar({ op, tabla: 'lista', fila });
    }
  },

  // ---------- compras: precio de cada cosa ----------
  /** Agrega un producto a la compra de esa fecha y lugar, y actualiza su gasto. */
  async agregarCompra({ id, fecha, lugar, producto, cantidad, unidad, precio, total }) {
    const misma = this.compras.find(c => c.fecha === fecha && c.lugar === lugar);
    const fila = {
      id: id || uid(), compra: misma ? misma.compra : uid(), fecha, lugar, producto,
      cantidad, unidad, precio, total,
      creado_por: this.usuario?.email ?? null,
      creado_en: new Date().toISOString(),
    };
    this.compras = [...this.compras, fila];
    guardar(K_COMPRAS, this.compras);
    this.alCambiar();
    await this.subirTabla('compras', 'insert', fila);
    await this.cuadrarGasto(fila.compra);
    return fila;
  },

  async borrarCompra(id) {
    const fila = this.compras.find(c => c.id === id);
    if (!fila) return;
    this.compras = this.compras.filter(c => c.id !== id);
    guardar(K_COMPRAS, this.compras);
    this.alCambiar();
    await this.subirTabla('compras', 'delete', fila);
    await this.cuadrarGasto(fila.compra);
  },

  async restaurarCompra(fila) {
    this.compras = [...this.compras.filter(c => c.id !== fila.id), fila]
      .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));
    guardar(K_COMPRAS, this.compras);
    this.alCambiar();
    await this.subirTabla('compras', 'insert', fila);
    await this.cuadrarGasto(fila.compra);
  },

  /** El gasto de una compra es un movimiento con el mismo id y la suma de sus productos. */
  async cuadrarGasto(compra) {
    const items = this.compras.filter(c => c.compra === compra);
    const mov = this.movimientos.find(m => m.id === compra);
    if (!items.length) { if (mov) await this.borrar(compra); return; }
    const monto = items.reduce((s, c) => s + (Number(c.total) || 0), 0);
    const { fecha, lugar } = items[0];
    if (mov) {
      if (mov.monto !== monto || mov.fecha !== fecha) await this.editar({ ...mov, monto, fecha });
    } else {
      await this.agregar({
        id: compra, fecha, tipo: 'Egreso', categoria: 'Gastos',
        concepto: lugar, presupuesto: null, monto,
      });
    }
  },

  async subirTabla(tabla, op, fila) {
    const t = op === 'delete' ? { op, tabla, id: fila.id } : { op, tabla, fila };
    if (this.enLinea) {
      let error;
      try {
        ({ error } = op === 'insert' ? await this.sb.from(tabla).upsert(fila)
          : op === 'update' ? await this.sb.from(tabla).update(fila).eq('id', fila.id)
          : await this.sb.from(tabla).delete().eq('id', fila.id));
      } catch (e) { error = e; }
      if (error) this.encolar(t);
    } else if (this.sb && this.usuario) {
      this.encolar(t);
    }
  },

  // ---------- gastos fijos ----------
  async guardarFijo(fila) {
    const f = { ...fila, id: fila.id || uid() };
    const i = this.fijos.findIndex(x => x.id === f.id);
    if (i >= 0) this.fijos[i] = { ...this.fijos[i], ...f };
    else this.fijos.push(f);
    this.fijos.sort((a, b) => (a.dia || 1) - (b.dia || 1));
    guardar(K_FIJOS, this.fijos);
    this.alCambiar();
    if (this.enLinea) {
      const { error } = await this.sb.from('fijos').upsert(f);
      if (error) this.encolar({ op: 'insert', tabla: 'fijos', fila: f });
    } else if (this.sb && this.usuario) {
      this.encolar({ op: 'insert', tabla: 'fijos', fila: f });
    }
    return f;
  },

  async borrarFijo(id) {
    this.fijos = this.fijos.filter(f => f.id !== id);
    guardar(K_FIJOS, this.fijos);
    this.alCambiar();
    if (this.enLinea) {
      const { error } = await this.sb.from('fijos').delete().eq('id', id);
      if (error) this.encolar({ op: 'delete', tabla: 'fijos', id });
    } else if (this.sb && this.usuario) {
      this.encolar({ op: 'delete', tabla: 'fijos', id });
    }
  },
};

const clave = f => `${f.fecha}|${f.tipo}|${f.concepto}|${f.monto}`;
const sinMeta = ({ id, fecha, tipo, categoria, concepto, presupuesto, monto, creado_por }) =>
  ({ id, fecha, tipo, categoria, concepto, presupuesto, monto, creado_por });

function normalizarCompra(f) {
  const n = v => (v == null ? null : Number(v));
  return { ...f, cantidad: n(f.cantidad), precio: n(f.precio), total: Number(f.total) };
}

function normalizar(f) {
  return {
    ...f,
    monto: Number(f.monto),
    presupuesto: f.presupuesto == null ? null : Number(f.presupuesto),
  };
}
