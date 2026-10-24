-- THEMIS · Esquema inicial de la base de datos (estado al 23-10-2026, antes de 20261023_01).
-- Sirve para recrear la base desde cero en un proyecto nuevo de Supabase: ejecutar este archivo
-- y después las demás migraciones en orden. En la base actual NO hay que ejecutarlo.
-- Generado a partir de la estructura real del proyecto (tablas, funciones, vista, políticas y permisos).

begin;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create sequence if not exists public.numeracion_asesorias start with 4000;

-- Tablas
create table public.estudiantes (
  id uuid default gen_random_uuid() not null,
  nombre_estudiante text not null,
  codigo_estudiante text not null,
  telefono_estudiante text,
  correo_estudiante text,
  nivel_consultorio text not null,
  creado_en timestamp with time zone default now()
);
create table public.usuarios (
  id uuid not null,
  correo text not null,
  creado_en timestamp with time zone default now(),
  rol text default 'monitor'::text not null,
  id_estudiante uuid
);
create table public.recepciones (
  id uuid default gen_random_uuid() not null,
  monitor_id uuid,
  fecha text,
  asesoria_no text,
  nombres_apellidos text,
  cedula_numero text,
  correo text,
  contacto_1 text,
  direccion text,
  area_derecho text,
  naturaleza_asunto text,
  estudiante_recepciona_nombre text,
  estudiante_recepciona_codigo text,
  detalles jsonb,
  pdf_url text,
  creado_en timestamp with time zone default now(),
  estudiante_asignado_nombre text
);
create table public.asignaciones (
  id uuid default gen_random_uuid() not null,
  id_recepcion uuid not null,
  asesoria_no text,
  id_estudiante uuid not null,
  codigo_estudiante text,
  fecha_asignacion date default CURRENT_DATE not null,
  activa boolean default true not null,
  creado_en timestamp with time zone default now(),
  observaciones text,
  fecha_reasignacion date,
  es_reasignacion boolean default false not null
);
create table public.horarios_estudiantes (
  id uuid default gen_random_uuid() not null,
  id_estudiante uuid not null,
  dia smallint not null,
  turno smallint not null
);

-- Restricciones
alter table public.estudiantes add constraint estudiantes_nivel_consultorio_check CHECK ((nivel_consultorio = ANY (ARRAY['DERECHO PUBLICO'::text, 'DERECHO PRIVADO'::text, 'DERECHO LABORAL'::text, 'DERECHO PENAL'::text])));
alter table public.estudiantes add constraint estudiantes_pkey PRIMARY KEY (id);
alter table public.estudiantes add constraint estudiantes_codigo_estudiante_key UNIQUE (codigo_estudiante);
alter table public.usuarios add constraint usuarios_rol_check CHECK ((rol = ANY (ARRAY['monitor'::text, 'administrador'::text, 'inactivo'::text])));
alter table public.usuarios add constraint usuarios_pkey PRIMARY KEY (id);
alter table public.recepciones add constraint recepciones_pkey PRIMARY KEY (id);
alter table public.asignaciones add constraint asignaciones_pkey PRIMARY KEY (id);
alter table public.horarios_estudiantes add constraint horarios_estudiantes_dia_check CHECK (((dia >= 1) AND (dia <= 5)));
alter table public.horarios_estudiantes add constraint horarios_estudiantes_turno_check CHECK (((turno >= 1) AND (turno <= 3)));
alter table public.horarios_estudiantes add constraint horarios_estudiantes_pkey PRIMARY KEY (id);
alter table public.horarios_estudiantes add constraint horarios_estudiantes_id_estudiante_dia_turno_key UNIQUE (id_estudiante, dia, turno);
alter table public.usuarios add constraint usuarios_id_estudiante_fkey FOREIGN KEY (id_estudiante) REFERENCES public.estudiantes(id) ON DELETE SET NULL;
alter table public.usuarios add constraint usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.recepciones add constraint recepciones_monitor_id_fkey FOREIGN KEY (monitor_id) REFERENCES public.usuarios(id);
alter table public.asignaciones add constraint asignaciones_id_recepcion_fkey FOREIGN KEY (id_recepcion) REFERENCES public.recepciones(id) ON DELETE CASCADE;
alter table public.asignaciones add constraint asignaciones_id_estudiante_fkey FOREIGN KEY (id_estudiante) REFERENCES public.estudiantes(id);
alter table public.horarios_estudiantes add constraint horarios_estudiantes_id_estudiante_fkey FOREIGN KEY (id_estudiante) REFERENCES public.estudiantes(id) ON DELETE CASCADE;

-- Índices que no vienen de una restricción
CREATE UNIQUE INDEX recepciones_asesoria_no_unico ON public.recepciones USING btree (asesoria_no) WHERE ((asesoria_no IS NOT NULL) AND (asesoria_no <> ''::text));
CREATE UNIQUE INDEX usuarios_id_estudiante_key ON public.usuarios USING btree (id_estudiante) WHERE (id_estudiante IS NOT NULL);

-- Funciones
CREATE OR REPLACE FUNCTION public.es_administrador()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.rol = 'administrador'
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.usuarios (id, correo)
  values (new.id, new.email);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recepcion_de_asesoria(p_numero text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
  v_id uuid;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede asignar asesorías';
  end if;

  select count(*) into v_n from public.recepciones r where r.asesoria_no = btrim(p_numero);
  if v_n = 0 then
    raise exception 'No existe la asesoría N° %', btrim(p_numero);
  elsif v_n > 1 then
    raise exception 'Hay más de una recepción con el N° de asesoría %', btrim(p_numero);
  end if;

  select r.id into v_id from public.recepciones r where r.asesoria_no = btrim(p_numero);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_asesoria(p_asesoria_no text, p_id_estudiante uuid, p_fecha date DEFAULT CURRENT_DATE, p_observaciones text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id_recepcion uuid;
  v_codigo       text;
  v_nueva        uuid;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede asignar asesorías';
  end if;

  v_id_recepcion := public.recepcion_de_asesoria(p_asesoria_no);

  -- Bloquea la recepción para que dos asignaciones simultáneas no se pisen
  perform 1 from public.recepciones where id = v_id_recepcion for update;

  select e.codigo_estudiante into v_codigo from public.estudiantes e where e.id = p_id_estudiante;
  if not found then
    raise exception 'El estudiante no existe';
  end if;

  if exists (
    select 1 from public.asignaciones a
    where a.id_recepcion = v_id_recepcion and a.id_estudiante = p_id_estudiante and a.activa = true
  ) then
    raise exception 'Ese estudiante ya tiene asignada la asesoría N° %', btrim(p_asesoria_no);
  end if;

  insert into public.asignaciones
    (id_recepcion, asesoria_no, id_estudiante, codigo_estudiante, fecha_asignacion, activa, observaciones)
  values
    (v_id_recepcion, btrim(p_asesoria_no), p_id_estudiante, v_codigo,
     coalesce(p_fecha, current_date), true, nullif(btrim(coalesce(p_observaciones, '')), ''))
  returning id into v_nueva;

  return v_nueva;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reasignar_asesoria(p_asesoria_no text, p_id_estudiante_nuevo uuid, p_id_estudiante_saliente uuid, p_fecha date DEFAULT CURRENT_DATE, p_observaciones text DEFAULT NULL::text, p_observaciones_nueva text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (id_recepcion, asesoria_no, id_estudiante, codigo_estudiante, fecha_asignacion, activa, observaciones)
  values
    (v_id_recepcion, btrim(p_asesoria_no), p_id_estudiante_nuevo, v_codigo,
     v_fecha, true, nullif(btrim(coalesce(p_observaciones_nueva, '')), ''))
  returning id into v_nueva;

  return v_nueva;
end;
$function$;

CREATE OR REPLACE FUNCTION public.quitar_asignacion(p_id_asignacion uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede quitar asignaciones';
  end if;

  delete from public.asignaciones where id = p_id_asignacion;

  if not found then
    raise exception 'La asignación ya no existe';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_recepcion(p_id_recepcion uuid, p_asesoria_no text, p_ids_estudiantes uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede asignar asesorías';
  end if;

  update public.asignaciones
    set activa = false
    where id_recepcion = p_id_recepcion and activa = true;

  insert into public.asignaciones (id_recepcion, asesoria_no, id_estudiante, codigo_estudiante, fecha_asignacion, activa)
  select p_id_recepcion, p_asesoria_no, e.id, e.codigo_estudiante, current_date, true
  from public.estudiantes e
  where e.id = any(p_ids_estudiantes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.casos_de_estudiante(p_id_estudiante uuid)
 RETURNS TABLE(id_recepcion uuid, asesoria_no text, nombres_apellidos text, area_derecho text)
 LANGUAGE sql
 STABLE
AS $function$
  select r.id, r.asesoria_no, r.nombres_apellidos, r.area_derecho
  from public.asignaciones a
  join public.recepciones r on r.id = a.id_recepcion
  where a.id_estudiante = p_id_estudiante
    and a.activa = true
  group by r.id, r.asesoria_no, r.nombres_apellidos, r.area_derecho
  order by length(r.asesoria_no) desc nulls last, r.asesoria_no desc nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.siguiente_numero_asesoria()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nextval('public.numeracion_asesorias')::integer;
$function$;

CREATE OR REPLACE FUNCTION public.numero_asesoria_existe(p_numero text, p_excluir uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.recepciones r
    where r.asesoria_no = p_numero
      and (p_excluir is null or r.id <> p_excluir)
  );
$function$;

CREATE OR REPLACE FUNCTION public.conteo_asesorias_por_estudiante()
 RETURNS TABLE(id_estudiante uuid, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select a.id_estudiante, count(distinct a.id_recepcion)::bigint as total
  from public.asignaciones a
  where a.activa = true
  group by a.id_estudiante;
$function$;

-- Vista del libro de asesorías (trae su propio filtro: el administrador ve todo y el monitor solo lo suyo)
create view public.libro_asesorias as
 SELECT r.id AS id_recepcion,
    r.asesoria_no,
    r.nombres_apellidos,
    r.fecha,
    r.cedula_numero,
    r.area_derecho,
    r.direccion,
    r.contacto_1,
    r.estudiante_recepciona_nombre,
    r.naturaleza_asunto,
    max(a.fecha_asignacion) AS fecha_asignacion,
    string_agg(DISTINCT e.nombre_estudiante, ', '::text) AS nombre_estudiante,
    string_agg(DISTINCT e.codigo_estudiante, ', '::text) AS codigo_estudiante,
    r.correo,
    r.pdf_url
   FROM recepciones r
     LEFT JOIN asignaciones a ON a.id_recepcion = r.id AND a.activa = true
     LEFT JOIN estudiantes e ON e.id = a.id_estudiante
  WHERE es_administrador() OR r.monitor_id = auth.uid()
  GROUP BY r.id, r.asesoria_no, r.nombres_apellidos, r.fecha, r.cedula_numero, r.area_derecho, r.direccion, r.contacto_1, r.estudiante_recepciona_nombre, r.naturaleza_asunto, r.correo, r.pdf_url;

-- Crear el perfil en public.usuarios cada vez que se crea una cuenta en Auth
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seguridad a nivel de fila
alter table public.estudiantes enable row level security;
alter table public.usuarios enable row level security;
alter table public.recepciones enable row level security;
alter table public.asignaciones enable row level security;
alter table public.horarios_estudiantes enable row level security;

create policy "usuarios: ver mi perfil" on public.usuarios
  as permissive for select to authenticated
  using ((id = auth.uid()));
create policy "recepciones: admin lee todo, monitor lo suyo" on public.recepciones
  as permissive for select to authenticated
  using ((es_administrador() OR (monitor_id = auth.uid())));
create policy "recepciones: crear a mi nombre" on public.recepciones
  as permissive for insert to authenticated
  with check ((monitor_id = auth.uid()));
create policy "recepciones: solo admin actualiza" on public.recepciones
  as permissive for update to authenticated
  using (es_administrador())
  with check (es_administrador());
create policy "recepciones: solo admin elimina" on public.recepciones
  as permissive for delete to authenticated
  using (es_administrador());
create policy "estudiantes: solo admin" on public.estudiantes
  as permissive for all to authenticated
  using (es_administrador())
  with check (es_administrador());
create policy "asignaciones: solo admin" on public.asignaciones
  as permissive for all to authenticated
  using (es_administrador())
  with check (es_administrador());
create policy "pdfs: subir autenticados" on storage.objects
  as permissive for insert to authenticated
  with check ((bucket_id = 'recepciones'::text));
create policy "pdfs: ver admin o dueño" on storage.objects
  as permissive for select to authenticated
  using (((bucket_id = 'recepciones'::text) AND (es_administrador() OR (owner_id = (( SELECT auth.uid() AS uid))::text))));
create policy "pdfs: borrar admin o dueño" on storage.objects
  as permissive for delete to authenticated
  using (((bucket_id = 'recepciones'::text) AND (es_administrador() OR (owner_id = (( SELECT auth.uid() AS uid))::text))));
create policy "horarios_leer" on public.horarios_estudiantes
  as permissive for select to authenticated
  using (true);
create policy "horarios_admin_escribir" on public.horarios_estudiantes
  as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'administrador'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'administrador'::text)))));
create policy "admin lee horarios" on public.horarios_estudiantes
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.rol = 'administrador'::text)))));

-- Permisos: el rol anónimo no tiene acceso a nada; el autenticado, solo a lo que usa la aplicación
revoke all on public.estudiantes, public.usuarios, public.recepciones, public.asignaciones, public.horarios_estudiantes, public.libro_asesorias from anon, authenticated;
grant select, insert, update, delete on public.estudiantes to authenticated;
grant select, insert, update on public.usuarios to authenticated;
grant select, insert, update, delete on public.recepciones to authenticated;
grant select, insert, update on public.asignaciones to authenticated;
grant select, insert, update, delete on public.horarios_estudiantes to authenticated;
grant select on public.libro_asesorias to authenticated;

revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.recepcion_de_asesoria(text) from public, anon;
revoke execute on function public.asignar_asesoria(text, uuid, date, text) from public, anon;
revoke execute on function public.reasignar_asesoria(text, uuid, uuid, date, text, text) from public, anon;
revoke execute on function public.quitar_asignacion(uuid) from public, anon;
revoke execute on function public.asignar_recepcion(uuid, text, uuid[]) from public, anon;
revoke execute on function public.casos_de_estudiante(uuid) from public, anon;
revoke execute on function public.siguiente_numero_asesoria() from public, anon;
revoke execute on function public.es_administrador() from public, anon;
revoke execute on function public.numero_asesoria_existe(text, uuid) from public, anon;
revoke execute on function public.conteo_asesorias_por_estudiante() from public, anon;
grant execute on function public.recepcion_de_asesoria(text) to authenticated;
grant execute on function public.asignar_asesoria(text, uuid, date, text) to authenticated;
grant execute on function public.quitar_asignacion(uuid) to authenticated;
grant execute on function public.reasignar_asesoria(text, uuid, uuid, date, text, text) to authenticated;
grant execute on function public.es_administrador() to authenticated;
grant execute on function public.numero_asesoria_existe(text, uuid) to authenticated;

-- Bucket privado de los PDFs de recepción
insert into storage.buckets (id, name, public) values ('recepciones', 'recepciones', false)
  on conflict (id) do nothing;

commit;
