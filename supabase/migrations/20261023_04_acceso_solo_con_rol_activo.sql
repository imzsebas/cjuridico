-- THEMIS · El acceso se pierde en cuanto se quita el rol (23-10-2026)
-- Al quitar el rol, la cuenta se bloquea, pero la sesión que ya estaba abierta sigue siendo válida
-- hasta que vence (cerca de una hora). Durante ese tiempo el monitor aún podía leer sus recepciones
-- y sus PDFs, porque esas reglas solo revisaban que el registro fuera suyo.
-- Ahora además exigen que su rol siga activo (tiene_acceso). Se puede ejecutar varias veces.

begin;

drop policy if exists "recepciones: admin lee todo, monitor lo suyo" on public.recepciones;
create policy "recepciones: admin lee todo, monitor lo suyo" on public.recepciones
  for select to authenticated
  using (public.es_administrador() or (monitor_id = auth.uid() and public.tiene_acceso()));

drop policy if exists "pdfs: ver admin o dueño" on storage.objects;
create policy "pdfs: ver admin o dueño" on storage.objects
  for select to authenticated
  using (bucket_id = 'recepciones'
         and (public.es_administrador() or (owner_id = (select auth.uid())::text and public.tiene_acceso())));

drop policy if exists "pdfs: borrar admin o dueño" on storage.objects;
create policy "pdfs: borrar admin o dueño" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recepciones'
         and (public.es_administrador() or (owner_id = (select auth.uid())::text and public.tiene_acceso())));

-- La vista del libro tiene su propio filtro (no pasa por las reglas de la tabla): se le aplica lo mismo.
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
  r.asesoria_num,
  r.periodo
from public.recepciones r
left join public.asignaciones a on a.id_recepcion = r.id and a.activa = true
left join public.estudiantes e on e.id = a.id_estudiante
where public.es_administrador() or (r.monitor_id = auth.uid() and public.tiene_acceso())
group by r.id, r.asesoria_no, r.nombres_apellidos, r.fecha, r.cedula_numero, r.area_derecho, r.direccion,
         r.contacto_1, r.estudiante_recepciona_nombre, r.naturaleza_asunto, r.correo, r.pdf_url,
         r.asesoria_num, r.periodo;

-- numero_asesoria_existe() la usa la recepción antes de guardar: solo para quien tiene rol activo.
create or replace function public.numero_asesoria_existe(p_numero text, p_excluir uuid default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.tiene_acceso() and exists (
    select 1 from public.recepciones r
    where r.asesoria_no = p_numero
      and (p_excluir is null or r.id <> p_excluir)
  );
$$;

commit;
