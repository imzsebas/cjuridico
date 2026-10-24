-- THEMIS · Seguridad e integridad de datos (23-10-2026)
-- Ejecutar completo en Supabase → SQL Editor. No borra ni modifica registros.
-- Después de ejecutarla, desplegar la versión del código que ya no marca es_reasignacion desde el navegador.

begin;

-- 1. Cuentas nuevas sin acceso por defecto.
--    Hoy toda cuenta creada en Auth queda con el rol por defecto de "usuarios". Si el registro público
--    está activo, cualquiera con la clave pública podría crearse una cuenta y entrar como monitor.
--    Ahora nace "inactivo"; la ruta /api/monitores le asigna el rol de monitor explícitamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.usuarios (id, correo, rol)
  values (new.id, new.email, 'inactivo');
  return new;
end;
$$;

-- 2. ¿El usuario actual es monitor o administrador activo?
create or replace function public.tiene_acceso()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.rol in ('monitor', 'administrador')
  );
$$;

-- 3. Recepciones: solo monitores y administradores activos pueden crear, y siempre a su nombre.
drop policy if exists "recepciones: crear a mi nombre" on public.recepciones;
create policy "recepciones: crear a mi nombre" on public.recepciones
  for insert to authenticated
  with check (monitor_id = auth.uid() and public.tiene_acceso());

-- 4. PDFs: solo monitores y administradores suben, y solo archivos .pdf.
drop policy if exists "pdfs: subir autenticados" on storage.objects;
drop policy if exists "pdfs: subir monitores y admin" on storage.objects;
create policy "pdfs: subir monitores y admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recepciones' and public.tiene_acceso() and lower(name) like '%.pdf');

-- 5. Horarios: los usa solo el administrador. Se quita la lectura abierta a cualquier usuario
--    y la política duplicada; queda una sola, igual que en las demás tablas.
drop policy if exists "horarios_leer" on public.horarios_estudiantes;
drop policy if exists "admin lee horarios" on public.horarios_estudiantes;
drop policy if exists "horarios_admin_escribir" on public.horarios_estudiantes;
drop policy if exists "horarios: solo admin" on public.horarios_estudiantes;
create policy "horarios: solo admin" on public.horarios_estudiantes
  for all to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

-- 6. Reasignación en un solo paso: la fila nueva queda marcada como reasignación dentro de la misma función.
create or replace function public.reasignar_asesoria(
  p_asesoria_no text,
  p_id_estudiante_nuevo uuid,
  p_id_estudiante_saliente uuid,
  p_fecha date default current_date,
  p_observaciones text default null,
  p_observaciones_nueva text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id_recepcion uuid;
  v_codigo       text;
  v_fecha        date := coalesce(p_fecha, current_date);
  v_motivo       text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_nueva        uuid;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede reasignar asesorías';
  end if;

  if v_motivo is null then
    raise exception 'Para reasignar hay que escribir una observación';
  end if;

  if p_id_estudiante_nuevo = p_id_estudiante_saliente then
    raise exception 'El estudiante nuevo y el que pierde la asesoría no pueden ser el mismo';
  end if;

  v_id_recepcion := public.recepcion_de_asesoria(p_asesoria_no);
  perform 1 from public.recepciones where id = v_id_recepcion for update;

  select e.codigo_estudiante into v_codigo from public.estudiantes e where e.id = p_id_estudiante_nuevo;
  if not found then
    raise exception 'El estudiante nuevo no existe';
  end if;

  if exists (
    select 1 from public.asignaciones a
    where a.id_recepcion = v_id_recepcion and a.id_estudiante = p_id_estudiante_nuevo and a.activa = true
  ) then
    raise exception 'El estudiante nuevo ya tiene asignada la asesoría N° %', btrim(p_asesoria_no);
  end if;

  -- El saliente pasa a historial (si ya tenía observación, se conserva y se le añade el motivo)
  update public.asignaciones a
     set activa = false,
         fecha_reasignacion = v_fecha,
         observaciones = case
           when nullif(btrim(coalesce(a.observaciones, '')), '') is null then v_motivo
           else a.observaciones || ' — ' || v_motivo
         end
   where a.id_recepcion = v_id_recepcion
     and a.id_estudiante = p_id_estudiante_saliente
     and a.activa = true;

  if not found then
    raise exception 'El estudiante seleccionado ya no tiene activa esa asesoría';
  end if;

  insert into public.asignaciones
    (id_recepcion, asesoria_no, id_estudiante, codigo_estudiante, fecha_asignacion, activa, observaciones, es_reasignacion)
  values
    (v_id_recepcion, btrim(p_asesoria_no), p_id_estudiante_nuevo, v_codigo,
     v_fecha, true, nullif(btrim(coalesce(p_observaciones_nueva, '')), ''), true)
  returning id into v_nueva;

  return v_nueva;
end;
$$;

-- 7. Orden por número de asesoría. "asesoria_no" es texto ("98" quedaba antes que "161");
--    esta columna guarda el mismo número como número y se calcula sola.
alter table public.recepciones
  add column if not exists asesoria_num bigint
  generated always as (case when asesoria_no ~ '^[0-9]+$' then asesoria_no::bigint end) stored;

-- La vista se recrea igual que antes, con asesoria_num al final (Postgres solo permite agregar columnas al final).
-- Conserva su filtro: el administrador ve todo y el monitor solo lo que él recepcionó.
create or replace view public.libro_asesorias as
select
  r.id as id_recepcion,
  r.asesoria_no,
  r.nombres_apellidos,
  r.fecha,
  r.cedula_numero,
  r.area_derecho,
  r.direccion,
  r.contacto_1,
  r.estudiante_recepciona_nombre,
  r.naturaleza_asunto,
  max(a.fecha_asignacion) as fecha_asignacion,
  string_agg(distinct e.nombre_estudiante, ', ') as nombre_estudiante,
  string_agg(distinct e.codigo_estudiante, ', ') as codigo_estudiante,
  r.correo,
  r.pdf_url,
  r.asesoria_num
from public.recepciones r
left join public.asignaciones a on a.id_recepcion = r.id and a.activa = true
left join public.estudiantes e on e.id = a.id_estudiante
where public.es_administrador() or r.monitor_id = auth.uid()
group by r.id, r.asesoria_no, r.nombres_apellidos, r.fecha, r.cedula_numero, r.area_derecho, r.direccion,
         r.contacto_1, r.estudiante_recepciona_nombre, r.naturaleza_asunto, r.correo, r.pdf_url, r.asesoria_num;

-- 8. Índices para las consultas más frecuentes (listados, asignaciones por caso y por estudiante, turnos).
create index if not exists recepciones_asesoria_num_idx on public.recepciones (asesoria_num desc);
create index if not exists recepciones_monitor_idx on public.recepciones (monitor_id);
create index if not exists asignaciones_recepcion_idx on public.asignaciones (id_recepcion);
create index if not exists asignaciones_estudiante_idx on public.asignaciones (id_estudiante) where activa;
create index if not exists horarios_dia_turno_idx on public.horarios_estudiantes (dia, turno);

-- 9. Funciones que la aplicación ya no usa.
--    asignar_recepcion desactivaba todas las asignaciones de un caso sin dejar motivo ni fecha de reasignación.
drop function if exists public.asignar_recepcion(uuid, text, uuid[]);
drop function if exists public.casos_de_estudiante(uuid);
drop function if exists public.conteo_asesorias_por_estudiante();
drop function if exists public.siguiente_numero_asesoria();

commit;
