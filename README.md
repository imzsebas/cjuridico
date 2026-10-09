# Consultorio Jurídico · Unicórdoba

Aplicación web para recibir, registrar y asignar las asesorías del Consultorio Jurídico.
Hecha con Next.js (App Router), React, Tailwind CSS y Supabase.

## Qué hace

- **Recepción** (monitores y administradores): formulario de 6 secciones. Al guardar, pide el
  siguiente N.º de asesoría, llena el formato `public/formato-recepcion.pdf`, lo sube a Supabase
  Storage y guarda los datos en la tabla `recepciones`.
- **Mis recepciones** (monitores): historial de las asesorías que cada monitor recepcionó, agrupado
  por año y periodo, con exportación a Excel.
- **Asignación** (administradores): asigna uno o varios estudiantes a cada caso y permite editar la
  información de la asesoría.
- **Libro de asesorías** (administradores): historial completo por año y periodo, con descarga del PDF.
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

### Migración de Monitores (una sola vez)

Ejecuta `supabase/monitores.sql` en el SQL Editor de Supabase. No borra ni modifica datos: agrega la
columna `usuarios.id_estudiante` y permite el rol `inactivo`.

### Qué pasa al quitar el rol de monitor

No se elimina nada. La cuenta queda bloqueada (no puede ingresar) y su rol pasa a `inactivo`, por lo
que ya no aparece en la lista. La fila de `usuarios`, sus recepciones, asignaciones y PDFs se conservan.
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
```

## Estructura

- `app/(panel)/` — pantallas del panel (recepción, asignación, libro, estudiantes, monitores, mis recepciones).
- `app/login/` — inicio de sesión y registro.
- `app/api/monitores/` — rutas de servidor (con `service_role`) para crear/editar/bloquear cuentas.
- `components/PanelLayout.tsx` — sidebar, barra superior móvil y menú inferior.
- `lib/formatoRecepcion.ts` — llenado del PDF y ajuste del texto al espacio del formato.
- `lib/estructuraRecepcion.ts` — secciones del formulario y validación de espacios en blanco.

> Este proyecto usa una versión de Next.js con cambios respecto a versiones anteriores.
> Consulta `node_modules/next/dist/docs/` antes de modificar convenciones del framework.
