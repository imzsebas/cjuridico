# Consultorio Jurídico · Unicórdoba

Aplicación web para recibir, registrar y asignar las asesorías del Consultorio Jurídico.
Hecha con Next.js (App Router), React y Supabase. Los estilos están en `app/globals.css` (CSS propio).

## Qué hace

- **Recepción** (monitores y administradores): formulario de 6 secciones. Al guardar, pide el
  siguiente N.º de asesoría, llena el formato `public/formato-recepcion.pdf`, lo sube a Supabase
  Storage y guarda los datos en la tabla `recepciones`.
- **Mis recepciones** (monitores): historial de las asesorías que cada monitor recepcionó, con búsqueda por
  N.º, nombre o cédula, filtros por área y periodo, y exportación a Excel.
- **Asignación** (administradores): asigna uno o varios estudiantes a cada caso, reasigna y deja
  observaciones. Desde el menú, **Generar reparto** descarga el Excel de asignaciones de una fecha o lapso.
- **Calendario** (administradores): turnos de lunes a viernes y quién está en cada uno.
- **Libro de asesorías** (administradores): historial completo con búsqueda y filtros por área y periodo,
  descarga del PDF,
  edición de todos los datos de la asesoría y eliminación.
- **Estudiantes** (administradores): directorio de estudiantes por nivel de consultorio.
- **Monitores** (administradores): lista de monitores activos. Permite asignar el rol a uno o varios
  estudiantes a la vez (con su correo y contraseña de ingreso), agregar un estudiante nuevo y
  asignarlo en un solo paso, editar credenciales y quitar el rol. Reemplaza el trabajo manual en
  Supabase.

## Roles

El rol de cada persona se lee de la tabla `usuarios` (`administrador`, `monitor` o `inactivo`). Al iniciar sesión,
el administrador entra a **Asignación** y el monitor a **Recepción**.

## Configuración

Crea un archivo `.env.local` en la raíz con:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # solo servidor: la usa la sección Monitores. NUNCA con NEXT_PUBLIC_
```

`SUPABASE_SERVICE_ROLE_KEY` está en Supabase → Project Settings → API (clave `service_role`). También
debe configurarse en las variables de entorno del hosting (p. ej. Vercel) y no se sube al repositorio.

### Base de datos

Los cambios de la base de datos se guardan en `supabase/migrations/` y se ejecutan en orden en Supabase → SQL Editor.

- `20261023_01_seguridad_e_integridad.sql` — cuentas nuevas sin acceso por defecto, solo monitores y administradores
  crean recepciones y suben PDFs, horarios solo para el administrador, reasignación en un solo paso, orden numérico
  del libro (`asesoria_num`) e índices.
- `20261023_02_permisos_funciones.sql` — permisos de ejecución de las funciones (solo `authenticated`).
- `20261023_03_periodo_para_busqueda.sql` — columna `periodo` (p. ej. 2026-II) y función `periodos_asesorias()`
  para los filtros del Libro de asesorías y Mis recepciones.
- `20261023_04_acceso_solo_con_rol_activo.sql` — al quitar el rol, la cuenta deja de ver sus recepciones y PDFs
  de inmediato, aunque su sesión siga abierta.

`20261023_00_esquema_inicial.sql` recrea la base desde cero (proyecto nuevo); en la base actual no se ejecuta.
Cada migración se ejecuta una sola vez y en orden.

En Supabase → Authentication, el registro público de usuarios debe estar **desactivado**: las cuentas las crea el
administrador desde la sección Monitores.

> Recuerda: lo que protege los datos son las políticas RLS de Supabase, no las redirecciones de la app.

### Qué pasa al quitar el rol de monitor

No se elimina nada. La cuenta queda bloqueada (no puede ingresar) y su rol pasa a `inactivo`, por lo
que ya no aparece en la lista. Si tenía la app abierta, la pierde de inmediato: la base deja de entregarle
datos y la app revisa el rol cada minuto, al volver a la pestaña y al cambiar de pantalla; al notarlo, cierra
la sesión y muestra el aviso en el login. La fila de `usuarios`, sus recepciones, asignaciones y PDFs se conservan.
Si se le vuelve a asignar el rol, la cuenta se reactiva con las credenciales nuevas.

El proyecto espera en Supabase, entre otros: las tablas `usuarios`, `recepciones` y `estudiantes`,
la vista `libro_asesorias`, las funciones `siguiente_numero_asesoria` y `asignar_recepcion`, y el
bucket de Storage `recepciones`.

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # compilación de producción
npm run lint
npm test        # pruebas automáticas (no necesitan conexión a Supabase)
```

### Pruebas

- `tests/lib/` — llenado del PDF, revisión del formulario, filtros, periodos, turnos y utilidades.
- `tests/api/` — permisos y validaciones de `/api/monitores`, con un Supabase falso en memoria.
- `tests/db/` — ejecuta **todas** las migraciones en un Postgres en memoria (PGlite) y comprueba qué puede hacer
  cada rol: administrador, monitor, monitor sin rol y usuario sin sesión. Si un cambio futuro abre un permiso
  por error, esta prueba falla.

## Estructura

- `app/(panel)/` — pantallas del panel (recepción, asignación, calendario, libro, estudiantes, monitores, mis recepciones).
- `app/login/` — inicio de sesión.
- `app/api/monitores/` — rutas de servidor (con `service_role`) para crear/editar/bloquear cuentas.
- `components/PanelLayout.tsx` — sidebar, barra superior móvil y menú inferior. Consulta la sesión y el rol
  una sola vez y los comparte con las pantallas (`lib/sesion.tsx`, hook `usePermiso`).
- `components/Modal.tsx` — estructura común de las ventanas modales (también se cierran con Escape).
- `components/Asesorias.tsx` + `lib/asesorias.ts` — tabla, detalle y exportación a Excel que comparten
  el Libro de asesorías y Mis recepciones.
- `lib/utilidades.ts` — funciones pequeñas compartidas (traer todo por bloques, fechas, descargas, errores).
- `lib/formatoRecepcion.ts` — llenado del PDF y ajuste del texto al espacio del formato.
- `lib/estructuraRecepcion.ts` — secciones del formulario y validación de espacios en blanco.

> Este proyecto usa una versión de Next.js con cambios respecto a versiones anteriores.
> Consulta `node_modules/next/dist/docs/` antes de modificar convenciones del framework.
