-- ============================================================
-- Base Lunar — esquema para Supabase
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- movimientos ----------
create table if not exists public.movimientos (
  id           uuid primary key default gen_random_uuid(),
  fecha        date        not null,
  tipo         text        not null check (tipo in ('Ingreso','Egreso')),
  categoria    text        not null,
  concepto     text        not null,
  presupuesto  numeric,
  monto        numeric     not null,
  creado_por   text,
  creado_en    timestamptz not null default now()
);

create index if not exists movimientos_fecha_idx on public.movimientos (fecha desc);

-- ---------- presupuestos ----------
create table if not exists public.presupuestos (
  id            uuid primary key default gen_random_uuid(),
  clasificacion text    not null,
  monto         numeric not null default 0,
  comentario    text
);

-- ---------- lista de compras y de deseos ----------
-- tipo 'Falta' = lo que hay que comprar;  'Deseo' = lo que se nos antoja
create table if not exists public.lista (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('Falta','Deseo')),
  nombre     text not null,
  lugar      text,
  precio     numeric,
  nota       text,
  listo      boolean not null default false,
  creado_por text,
  creado_en  timestamptz not null default now()
);

create index if not exists lista_tipo_idx on public.lista (tipo, listo);

-- ---------- seguridad ----------
-- Solo quien haya iniciado sesión puede ver y escribir. Nadie más,
-- aunque tenga la anon key y el link del repo.
alter table public.movimientos  enable row level security;
alter table public.presupuestos enable row level security;
alter table public.lista        enable row level security;

drop policy if exists "casa_lee_mov"     on public.movimientos;
drop policy if exists "casa_escribe_mov" on public.movimientos;
drop policy if exists "casa_edita_mov"   on public.movimientos;
drop policy if exists "casa_borra_mov"   on public.movimientos;

create policy "casa_lee_mov"     on public.movimientos for select to authenticated using (true);
create policy "casa_escribe_mov" on public.movimientos for insert to authenticated with check (true);
create policy "casa_edita_mov"   on public.movimientos for update to authenticated using (true) with check (true);
create policy "casa_borra_mov"   on public.movimientos for delete to authenticated using (true);

drop policy if exists "casa_lee_ppto"     on public.presupuestos;
drop policy if exists "casa_escribe_ppto" on public.presupuestos;
drop policy if exists "casa_edita_ppto"   on public.presupuestos;
drop policy if exists "casa_borra_ppto"   on public.presupuestos;

create policy "casa_lee_ppto"     on public.presupuestos for select to authenticated using (true);
create policy "casa_escribe_ppto" on public.presupuestos for insert to authenticated with check (true);
create policy "casa_edita_ppto"   on public.presupuestos for update to authenticated using (true) with check (true);
create policy "casa_borra_ppto"   on public.presupuestos for delete to authenticated using (true);

drop policy if exists "casa_lee_lista"     on public.lista;
drop policy if exists "casa_escribe_lista" on public.lista;
drop policy if exists "casa_edita_lista"   on public.lista;
drop policy if exists "casa_borra_lista"   on public.lista;

create policy "casa_lee_lista"     on public.lista for select to authenticated using (true);
create policy "casa_escribe_lista" on public.lista for insert to authenticated with check (true);
create policy "casa_edita_lista"   on public.lista for update to authenticated using (true) with check (true);
create policy "casa_borra_lista"   on public.lista for delete to authenticated using (true);

-- ---------- sincronización en vivo entre los dos teléfonos ----------
-- Envuelto para que se pueda volver a correr el archivo completo sin que
-- reclame que la tabla ya estaba publicada.
do $$ begin
  alter publication supabase_realtime add table public.movimientos;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.lista;
exception when others then null; end $$;

-- ---------- presupuestos iniciales (los de la planilla) ----------
insert into public.presupuestos (clasificacion, monto, comentario)
select * from (values
  ('Carnes',                      70000,  'Idealmente 9 kilos al mes'),
  ('Aseo',                        60000,  null),
  ('Feria',                       60000,  '$15.000 semanales'),
  ('Lácteos, Huevos (Desayunos)', 50000,  null),
  ('Despensa básica',             60000,  'Carbohidratos, etc.'),
  ('Deudas',                      100000, 'Ojalá no superar'),
  ('Servicios',                   60000,  'Luz y agua')
) as v(clasificacion, monto, comentario)
where not exists (select 1 from public.presupuestos);

-- ---------- para partir: lo que falta y lo que se nos antoja ----------
insert into public.lista (tipo, nombre, lugar)
select * from (values
  ('Falta', 'Fajitas',      'Súper'),
  ('Falta', 'Pan',          'Súper'),
  ('Falta', 'Papas',        'Feria'),
  ('Deseo', 'Aplastapapas', null),
  ('Deseo', 'Air fryer',    null)
) as v(tipo, nombre, lugar)
where not exists (select 1 from public.lista);
