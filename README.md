# Base Lunar

App de gastos compartidos para dos personas. Registro rápido desde el celular,
dashboard con las mismas categorías y presupuestos de la planilla, y export a
Excel con las columnas exactas de la hoja **Registros**.

- Se instala como app en el teléfono (PWA).
- Funciona sin señal: guarda local y sube los cambios cuando vuelve internet.
- Los dos ven lo mismo al instante (sincronización en vivo).

---

## Puesta en marcha (una sola vez, ~15 minutos)

### 1. Crear la base de datos

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratis.
2. **New project** → nombre `base-lunar`, región *South America (São Paulo)*,
   y anota la contraseña que te pida (es de la base, no la vas a usar en la app).
3. Cuando termine de crearse, anda a **SQL Editor → New query**, pega todo el
   contenido de [`esquema.sql`](esquema.sql) y aprieta **Run**.

### 2. Crear los dos usuarios

En **Authentication → Users → Add user → Create new user**:

- uno con tu correo y una clave
- otro con el correo de la Cami y una clave

Marca **Auto Confirm User** en ambos para que no tengan que confirmar por mail.
Esas claves las eliges tú: la app nunca las guarda, solo las manda a Supabase.

### 3. Pegar las llaves en `config.js`

| Dónde está en Supabase | Va en `config.js` |
|---|---|
| **Settings → Data API → Project URL** | `SUPABASE_URL` |
| **Settings → API Keys → Publishable key** (`sb_publishable_…`) | `SUPABASE_ANON_KEY` |

```js
window.CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxx',
};
```

Supabase renombró sus llaves: la **publishable key** es la que antes se
llamaba `anon public`. Si tu proyecto todavía muestra las antiguas, están en
la pestaña *Legacy anon, service_role API keys* y funcionan igual (Supabase
las mantiene hasta fines de 2026).

> Esa llave es pública por diseño: sola no sirve de nada, porque las políticas
> RLS del `esquema.sql` exigen sesión iniciada para leer o escribir. La que
> **nunca** se pega acá es la **Secret key** (`sb_secret_…`, antes
> `service_role`): esa se salta todas las reglas.

### 4. Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Base Lunar"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/base-lunar.git
git push -u origin main
```

En el repo: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
En un par de minutos queda en `https://TU-USUARIO.github.io/base-lunar/`.

### 5. Instalarla en el celular

Abre ese link en el teléfono:

- **Android (Chrome):** menú ⋮ → *Agregar a pantalla principal*
- **iPhone (Safari):** compartir → *Agregar a inicio*

Queda con ícono propio y se abre en pantalla completa, como una app normal.

### 6. Cargar el histórico

La primera vez, en **⚙ Ajustes → Importar histórico**: sube las 72 filas que ya
venían en la planilla (junio 2026 en adelante, incluyendo las proyecciones hasta
enero 2027). Hazlo **una sola vez y desde un solo teléfono**.

---

## Cómo se usa

| Pantalla | Para qué |
|---|---|
| **Resumen** | Saldo del mes, egresos por categoría, gastado v/s presupuesto y la curva de ingresos v/s egresos mes a mes. |
| **Registrar** | Monto, concepto, categoría y listo. La fecha viene puesta en hoy. |
| **Lista** | Dos pestañas: *Falta comprar* (lo que hay que traer, etiquetado por Súper / Feria / Chinos / Otro) y *Se nos antoja* (los deseos para la casa, con precio aproximado). |
| **Historial** | Todo el mes, buscable, con editar y borrar. |
| **Ppto** | Las metas mensuales de la hoja *Presupuestos*, editables. |
| **⚙ Ajustes** | Exportar a Excel o CSV, importar histórico, tema y estado de sincronización. |

Las categorías son exactamente las de la planilla:

- **Ingresos:** Aporte Cami · Aporte Panchi · Baes Panchi · Otros
- **Egresos:** Gastos · Servicios · Deudas · Ahorro · Gasto Baes

### La lista de compras

Se agrega escribiendo y apretando **+**. Cada cosa lleva dónde se compra, así
que estando en la feria se filtra por *Feria* y queda solo lo que corresponde.
Se marca con el círculo al comprarla: baja a **Ya en el carro** y se puede
vaciar todo de una. El globito en la barra de abajo muestra cuántas quedan
pendientes, y se actualiza en los dos teléfonos al mismo tiempo.

Los deseos funcionan igual, con un precio aproximado opcional: arriba se ve
cuánto suma todo lo que está en la mira.

### Volver al Excel

**Ajustes → Excel (.xlsx)** genera un archivo con las columnas
`Fecha · Mes · Tipo · Categoría · Concepto · Presupuestos · Monto`, en ese orden
y con el mes en formato `sept-26`. Se copia y se pega al final de la tabla
`Registros` de la planilla: el Dashboard se recalcula solo.

---

## Sin Supabase

Si dejas `config.js` como viene, la app igual funciona: guarda todo en el
teléfono donde se abra. Sirve para probarla, pero **no se comparte entre los
dos**. Lo mismo pasa con el botón *Usar sin cuenta*.

## Estructura

```
index.html              pantallas
config.js               llaves de Supabase  ← lo único que editas
esquema.sql             tablas + permisos
css/estilos.css         estilos (claro y oscuro)
js/app.js               controlador y render
js/datos.js             Supabase + caché local + cola offline
js/graficos.js          gráficos en SVG/HTML, sin librerías
js/excel.js             export .xlsx / .csv
js/util.js              formato de plata, meses, categorías
datos/historico.json    las 72 filas que venían en la planilla
sw.js                   service worker (funciona sin señal)
```

## Problemas comunes

**"Correo o clave incorrectos"** — el usuario tiene que existir en
*Authentication → Users* y estar confirmado.

**No se sincroniza** — revisa que `esquema.sql` se haya corrido completo,
en especial la parte de `supabase_realtime`. El archivo se puede volver a
correr entero cuantas veces haga falta: no duplica nada.

**Actualicé la app y falta la tabla `lista`** — vuelve a correr `esquema.sql`
completo; crea lo que falte y deja lo que ya estaba tal cual.

**Cambié un archivo y el celular muestra lo viejo** — el service worker cachea.
Sube el número de `VERSION` en `sw.js` y recarga.
