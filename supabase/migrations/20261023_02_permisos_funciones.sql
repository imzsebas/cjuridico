-- THEMIS · Permisos de ejecución de las funciones (23-10-2026)
-- Las funciones de la aplicación solo las ejecuta el rol "authenticated" (usuarios con sesión).
-- tiene_acceso() la usan las políticas de recepciones y de los PDFs: sin este permiso, los monitores
-- no podrían guardar recepciones. Se puede ejecutar varias veces sin problema.

begin;

revoke execute on function public.tiene_acceso() from public, anon;
grant execute on function public.tiene_acceso() to authenticated;

-- reasignar_asesoria se recreó en la migración 01: se reafirman sus permisos
revoke execute on function public.reasignar_asesoria(text, uuid, uuid, date, text, text) from public, anon;
grant execute on function public.reasignar_asesoria(text, uuid, uuid, date, text, text) to authenticated;

-- handle_new_user solo la usa el trigger de Auth: nadie necesita ejecutarla directamente
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Refuerzo: además del trigger, el valor por defecto de la columna también deja las cuentas sin acceso
alter table public.usuarios alter column rol set default 'inactivo';

commit;
