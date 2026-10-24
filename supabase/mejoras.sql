-- =====================================================================
-- THEMIS · mejoras opcionales de la base de datos
-- Ejecutar en Supabase → SQL Editor. Ninguna borra ni modifica datos.
-- La aplicación funciona igual sin ellas; cada una corrige un problema concreto.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ORDEN POR NÚMERO DE ASESORÍA
-- "asesoria_no" es texto, así que al ordenar queda "98" antes que "161".
-- Esta columna guarda el mismo número como número (se calcula sola; no hay que llenarla).
-- La app ya la usa si existe; si no existe, ordena como antes.
-- ---------------------------------------------------------------------

alter table public.recepciones
  add column if not exists asesoria_num bigint
  generated always as (case when asesoria_no ~ '^[0-9]+$' then asesoria_no::bigint end) stored;

create index if not exists recepciones_asesoria_num_idx on public.recepciones (asesoria_num desc);

-- 1b. El Libro de asesorías lee la vista "libro_asesorias": hay que agregarle la columna al final.
--     Paso 1: ver la definición actual de la vista:
select pg_get_viewdef('public.libro_asesorias', true);
--     Paso 2: copiar esa definición dentro de un "create or replace view" y agregar, AL FINAL de la
--     lista de columnas del SELECT, la columna nueva de recepciones. Por ejemplo, si la vista usa
--     el alias "r" para recepciones:
--
--       create or replace view public.libro_asesorias as
--       select
--         ...todas las columnas que ya tiene, en el mismo orden...,
--         r.asesoria_num
--       from ...lo mismo que ya tiene...;
--
--     (Postgres solo permite agregar columnas al final; no cambies el orden de las existentes.)


-- ---------------------------------------------------------------------
-- 2. QUE EL N.º DE ASESORÍA NO SE PUEDA REPETIR
-- La app revisa antes de guardar, pero si dos monitores guardan el mismo número al mismo tiempo,
-- ambos pasan. Este índice lo impide desde la base de datos (los registros sin número no cuentan).
-- ---------------------------------------------------------------------

-- Primero revisa si ya hay números repetidos (si sale algo, corrígelo antes de crear el índice):
select asesoria_no, count(*) from public.recepciones
where coalesce(trim(asesoria_no), '') <> ''
group by asesoria_no having count(*) > 1;

create unique index if not exists recepciones_asesoria_no_unica
  on public.recepciones (asesoria_no)
  where coalesce(trim(asesoria_no), '') <> '';


-- ---------------------------------------------------------------------
-- 3. PENDIENTE: REASIGNACIÓN EN UN SOLO PASO
-- Hoy la app llama a reasignar_asesoria(...) y DESPUÉS marca es_reasignacion = true con un
-- update aparte. Si ese segundo paso falla, la reasignación queda sin marcar.
-- Lo correcto es hacer ese update dentro de la propia función reasignar_asesoria.
-- Para cambiarla hace falta ver su código actual:
select pg_get_functiondef('public.reasignar_asesoria'::regproc);
-- ---------------------------------------------------------------------
