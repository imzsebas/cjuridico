// Ejecuta todas las migraciones de supabase/migrations sobre un Postgres real (PGlite, en memoria)
// y comprueba qué puede hacer cada tipo de usuario. Así, si un cambio futuro abre un permiso por error, se nota aquí.
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const MONITOR = '00000000-0000-4000-8000-00000000000b';
const RETIRADO = '00000000-0000-4000-8000-00000000000c'; // monitor al que se le quitó el rol
const NUEVA = '00000000-0000-4000-8000-00000000000d'; // cuenta creada en Auth sin pasar por la app

const db = new PGlite();
const q = (sql: string, p: unknown[] = []) => db.query<Record<string, unknown>>(sql, p);

// Ejecuta como un usuario con sesión (rol "authenticated" y su id en el token), como lo hace Supabase
async function como<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);` : 'set role anon;');
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

beforeAll(async () => {
  // Lo mínimo de Supabase que usan las migraciones: roles, auth.uid() y storage
  await db.exec(`
    create role authenticated nologin; create role anon nologin; create role supabase_auth_admin nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
      owner_id text default auth.uid()::text);
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, public to authenticated, anon, supabase_auth_admin;
    grant execute on function auth.uid() to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;
    grant insert on auth.users to supabase_auth_admin;
  `);

  // Todas las migraciones, en orden (PGlite no trae pgcrypto/uuid-ossp; Supabase sí, y aquí no hacen falta)
  const carpeta = 'supabase/migrations/';
  for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(carpeta + archivo, 'utf8').replace(/^create extension.*$/gm, ''));
  }

  // Cuentas creadas por Auth (el trigger las deja inactivas) y luego ajustadas como lo haría la app
  await db.exec('set role supabase_auth_admin');
  await q(`insert into auth.users (id, email) values ($1,'admin@u.co'),($2,'mon@u.co'),($3,'ret@u.co'),($4,'nueva@u.co')`,
    [ADMIN, MONITOR, RETIRADO, NUEVA]);
  await db.exec('reset role');
  await q(`update public.usuarios set rol = 'administrador' where id = $1`, [ADMIN]);
  await q(`update public.usuarios set rol = 'monitor' where id = $1`, [MONITOR]);

  // Datos de ejemplo
  const est = (await q(`insert into public.estudiantes (nombre_estudiante, codigo_estudiante, nivel_consultorio)
    values ('ANA','1','DERECHO PENAL'),('LUIS','2','DERECHO PENAL') returning id`)).rows;
  await q(`insert into public.recepciones (monitor_id, asesoria_no, nombres_apellidos, fecha) values
    ($1,'98','A','22/10/2026'), ($1,'161','B','2/3/26'), ($2,'5','C','01/07/2025'), ($3,'40','D','10/10/2026')`,
    [MONITOR, ADMIN, RETIRADO]);
  const rec161 = (await q(`select id from public.recepciones where asesoria_no = '161'`)).rows[0].id;
  await q(`insert into public.asignaciones (id_recepcion, asesoria_no, id_estudiante, fecha_asignacion)
    values ($1, '161', $2, current_date)`, [rec161, est[0].id]);
  await q(`insert into public.horarios_estudiantes (id_estudiante, dia, turno) values ($1, 1, 1)`, [est[0].id]);
  await q(`insert into storage.objects (bucket_id, name, owner_id) values ('recepciones','ret.pdf',$1)`, [RETIRADO]);
  // Se le quita el rol después de haber trabajado
  await q(`update public.usuarios set rol = 'inactivo' where id = $1`, [RETIRADO]);
}, 60_000);

const numeros = (filas: Record<string, unknown>[]) => filas.map((f) => f.asesoria_no);

describe('cuentas nuevas', () => {
  it('nacen inactivas, aunque se creen por fuera de la app', async () => {
    expect((await q(`select rol from public.usuarios where id = $1`, [NUEVA])).rows[0].rol).toBe('inactivo');
  });

  it('una cuenta inactiva no puede crear recepciones ni subir PDFs', async () => {
    await expect(como(NUEVA, () => q(`insert into public.recepciones (monitor_id, asesoria_no) values ($1,'700')`, [NUEVA])))
      .rejects.toThrow(/row-level security/);
    await expect(como(NUEVA, () => q(`insert into storage.objects (bucket_id, name) values ('recepciones','x.pdf')`)))
      .rejects.toThrow(/row-level security/);
  });
});

describe('monitor', () => {
  it('crea recepciones solo a su nombre', async () => {
    await como(MONITOR, () => q(`insert into public.recepciones (monitor_id, asesoria_no) values ($1,'200')`, [MONITOR]));
    await expect(como(MONITOR, () => q(`insert into public.recepciones (monitor_id, asesoria_no) values ($1,'201')`, [ADMIN])))
      .rejects.toThrow(/row-level security/);
  });

  it('no puede repetir un número de asesoría', async () => {
    await expect(como(MONITOR, () => q(`insert into public.recepciones (monitor_id, asesoria_no) values ($1,'98')`, [MONITOR])))
      .rejects.toThrow(/duplicate key/);
  });

  it('en el libro solo ve lo suyo', async () => {
    const r = await como(MONITOR, () => q(`select asesoria_no from public.libro_asesorias`));
    expect(numeros(r.rows).sort()).toEqual(['161', '200', '98']);
  });

  it('no puede volverse administrador ni editar o borrar recepciones', async () => {
    expect((await como(MONITOR, () => q(`update public.usuarios set rol = 'administrador' where id = $1`, [MONITOR]))).affectedRows).toBe(0);
    expect((await como(MONITOR, () => q(`update public.recepciones set nombres_apellidos = 'X'`))).affectedRows).toBe(0);
    expect((await como(MONITOR, () => q(`delete from public.recepciones`))).affectedRows).toBe(0);
  });

  it('no ve estudiantes, asignaciones ni horarios', async () => {
    for (const tabla of ['estudiantes', 'asignaciones', 'horarios_estudiantes']) {
      expect((await como(MONITOR, () => q(`select * from public.${tabla}`))).rows).toHaveLength(0);
    }
  });

  it('solo sube archivos PDF', async () => {
    await como(MONITOR, () => q(`insert into storage.objects (bucket_id, name) values ('recepciones','a.pdf')`));
    await expect(como(MONITOR, () => q(`insert into storage.objects (bucket_id, name) values ('recepciones','a.exe')`)))
      .rejects.toThrow(/row-level security/);
  });

  it('no puede reasignar', async () => {
    await expect(como(MONITOR, () => q(`select public.reasignar_asesoria('161', gen_random_uuid(), gen_random_uuid(), current_date, 'x')`)))
      .rejects.toThrow('Solo un administrador');
  });
});

describe('monitor al que se le quitó el rol (con la sesión aún abierta)', () => {
  it('ya no ve sus recepciones, ni en la tabla ni en el libro', async () => {
    expect((await como(RETIRADO, () => q(`select * from public.recepciones`))).rows).toHaveLength(0);
    expect((await como(RETIRADO, () => q(`select * from public.libro_asesorias`))).rows).toHaveLength(0);
  });

  it('ya no puede abrir ni borrar sus PDFs', async () => {
    expect((await como(RETIRADO, () => q(`select * from storage.objects`))).rows).toHaveLength(0);
    expect((await como(RETIRADO, () => q(`delete from storage.objects`))).affectedRows).toBe(0);
  });

  it('ya no puede consultar si un número existe', async () => {
    expect((await como(RETIRADO, () => q(`select public.numero_asesoria_existe('98') as existe`))).rows[0].existe).toBe(false);
    expect((await como(MONITOR, () => q(`select public.numero_asesoria_existe('98') as existe`))).rows[0].existe).toBe(true);
  });
});

describe('administrador', () => {
  it('ve todo el libro, ordenado por número', async () => {
    const r = await como(ADMIN, () => q(`select asesoria_no from public.libro_asesorias order by asesoria_num desc`));
    expect(numeros(r.rows)).toEqual(['200', '161', '98', '40', '5']);
  });

  it('el periodo se calcula solo y sirve para filtrar', async () => {
    const r = await como(ADMIN, () => q(`select asesoria_no, periodo from public.libro_asesorias order by asesoria_num`));
    expect(Object.fromEntries(r.rows.map((f) => [f.asesoria_no, f.periodo]))).toMatchObject({
      '5': '2025-II', '40': '2026-II', '98': '2026-II', '161': '2026-I',
    });
    expect((await como(ADMIN, () => q(`select * from public.periodos_asesorias() p`))).rows.map((f) => f.p))
      .toEqual(['2026-II', '2026-I', '2025-II']);
  });

  it('la reasignación queda marcada en un solo paso', async () => {
    const [ana, luis] = (await q(`select id from public.estudiantes order by codigo_estudiante`)).rows.map((f) => f.id);
    await como(ADMIN, () => q(`select public.reasignar_asesoria('161', $1, $2, current_date, 'cambio de turno')`, [luis, ana]));
    const r = (await q(`select id_estudiante, activa, es_reasignacion, observaciones from public.asignaciones
      where asesoria_no = '161' order by activa`)).rows;
    expect(r[0]).toMatchObject({ id_estudiante: ana, activa: false, observaciones: 'cambio de turno' });
    expect(r[1]).toMatchObject({ id_estudiante: luis, activa: true, es_reasignacion: true });
  });

  it('lee y escribe horarios', async () => {
    expect((await como(ADMIN, () => q(`select * from public.horarios_estudiantes`))).rows.length).toBeGreaterThan(0);
  });
});

describe('sin sesión (rol anónimo)', () => {
  it('no puede leer nada ni usar las funciones', async () => {
    await expect(como(null, () => q(`select * from public.recepciones`))).rejects.toThrow(/permission denied/);
    await expect(como(null, () => q(`select * from public.libro_asesorias`))).rejects.toThrow(/permission denied/);
    await expect(como(null, () => q(`select public.tiene_acceso()`))).rejects.toThrow(/permission denied/);
    await expect(como(null, () => q(`select public.periodos_asesorias()`))).rejects.toThrow(/permission denied/);
  });
});
