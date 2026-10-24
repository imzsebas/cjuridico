-- THEMIS · Periodo académico para filtrar el Libro de asesorías y Mis recepciones (23-10-2026)
-- La fecha se guarda como texto ("22/10/2026" o "2/3/26"). Esta columna calcula sola el periodo
-- ("2026-II"): enero a junio es I y julio a diciembre es II. Si la fecha no es válida, queda vacía.
-- Se puede ejecutar varias veces sin problema.

begin;

alter table public.recepciones
  add column if not exists periodo text generated always as (
    case when btrim(fecha) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' then
      case when split_part(btrim(fecha), '/', 2)::int between 1 and 12 then
        (case when length(split_part(btrim(fecha), '/', 3)) <= 2
              then 2000 + split_part(btrim(fecha), '/', 3)::int
              else split_part(btrim(fecha), '/', 3)::int end)::text
        || case when split_part(btrim(fecha), '/', 2)::int <= 6 then '-I' else '-II' end
      end
    end
  ) stored;

create index if not exists recepciones_periodo_idx on public.recepciones (periodo);

-- La vista se recrea igual, con periodo al final.
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
where public.es_administrador() or r.monitor_id = auth.uid()
group by r.id, r.asesoria_no, r.nombres_apellidos, r.fecha, r.cedula_numero, r.area_derecho, r.direccion,
         r.contacto_1, r.estudiante_recepciona_nombre, r.naturaleza_asunto, r.correo, r.pdf_url,
         r.asesoria_num, r.periodo;

-- Periodos que tienen asesorías, del más reciente al más antiguo (opciones del filtro).
-- Lee la vista, así que el monitor solo ve los periodos de sus propias recepciones.
create or replace function public.periodos_asesorias()
returns setof text
language sql
stable
set search_path to 'public'
as $$
  select periodo
  from public.libro_asesorias
  where periodo is not null
  group by periodo
  order by split_part(periodo, '-', 1)::int desc, (periodo like '%-II') desc;
$$;

revoke execute on function public.periodos_asesorias() from public, anon;
grant execute on function public.periodos_asesorias() to authenticated;

commit;
