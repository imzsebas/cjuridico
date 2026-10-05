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

## Roles

El rol de cada persona se lee de la tabla `usuarios` (`administrador` o `monitor`). Al iniciar sesión,
el administrador entra a **Asignación** y el monitor a **Recepción**.

## Configuración

Crea un archivo `.env.local` en la raíz con:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

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

- `app/(panel)/` — pantallas del panel (recepción, asignación, libro, estudiantes, mis recepciones).
- `app/login/` — inicio de sesión y registro.
- `components/PanelLayout.tsx` — sidebar, barra superior móvil y menú inferior.
- `lib/formatoRecepcion.ts` — llenado del PDF y ajuste del texto al espacio del formato.
- `lib/estructuraRecepcion.ts` — secciones del formulario y validación de espacios en blanco.

> Este proyecto usa una versión de Next.js con cambios respecto a versiones anteriores.
> Consulta `node_modules/next/dist/docs/` antes de modificar convenciones del framework.
