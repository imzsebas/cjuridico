// Pruebas de las rutas /api/monitores con un Supabase falso en memoria (no se conecta a nada).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

type Fila = Record<string, unknown>;
const db: Record<string, Fila[]> = {};
const sesiones: Record<string, string> = {}; // token → id de usuario
const llamadasAuth: { accion: string; datos: unknown }[] = [];

// Constructor de consultas mínimo: select, eq, in, order, range, single, maybeSingle, update, upsert
function consulta(tabla: string) {
  const filtros: ((f: Fila) => boolean)[] = [];
  let cambio: Fila | null = null;
  let upsert: Fila | null = null;
  const filas = () => (db[tabla] ?? []).filter((f) => filtros.every((c) => c(f)));
  const resolver = () => {
    if (upsert) {
      const i = (db[tabla] ??= []).findIndex((f) => f.id === upsert!.id);
      if (i >= 0) db[tabla][i] = { ...db[tabla][i], ...upsert }; else db[tabla].push(upsert);
      return { data: null, error: null };
    }
    if (cambio) { filas().forEach((f) => Object.assign(f, cambio)); return { data: null, error: null }; }
    return { data: filas(), error: null };
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q; },
    in: (c: string, v: unknown[]) => { filtros.push((f) => v.includes(f[c])); return q; },
    order: () => q,
    range: (a: number, b: number) => Promise.resolve({ data: filas().slice(a, b + 1), error: null }),
    single: () => Promise.resolve(filas()[0] ? { data: filas()[0], error: null } : { data: null, error: { message: 'no encontrado' } }),
    maybeSingle: () => Promise.resolve({ data: filas()[0] ?? null, error: null }),
    update: (c: Fila) => { cambio = c; return q; },
    upsert: (f: Fila) => { upsert = f; return q; },
    then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, mal),
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: consulta,
    auth: {
      getUser: async (token: string) =>
        sesiones[token] ? { data: { user: { id: sesiones[token] } }, error: null } : { data: { user: null }, error: { message: 'token' } },
      admin: {
        createUser: async (datos: { email: string }) => {
          llamadasAuth.push({ accion: 'crear', datos });
          const id = `00000000-0000-4000-8000-${String(llamadasAuth.length).padStart(12, '0')}`;
          db.usuarios.push({ id, correo: datos.email, rol: 'inactivo', id_estudiante: null }); // lo que hace el trigger
          return { data: { user: { id } }, error: null };
        },
        updateUserById: async (id: string, datos: unknown) => { llamadasAuth.push({ accion: 'actualizar', datos: { id, ...(datos as object) } }); return { error: null }; },
        deleteUser: async (id: string) => { llamadasAuth.push({ accion: 'borrar', datos: id }); return { error: null }; },
      },
    },
  }),
}));

const { GET, POST } = await import('@/app/api/monitores/route');
const { PATCH } = await import('@/app/api/monitores/[id]/route');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const MONITOR = '22222222-2222-4222-8222-222222222222';
const EST = '33333333-3333-4333-8333-333333333333';
const EST2 = '44444444-4444-4444-8444-444444444444';

const pedir = (token: string | null, cuerpo?: unknown) =>
  new Request('http://app/api/monitores', {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  }) as unknown as NextRequest;
const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db.usuarios = [
    { id: ADMIN, correo: 'admin@u.co', rol: 'administrador', id_estudiante: null, creado_en: '2026-01-01' },
    { id: MONITOR, correo: 'mon@u.co', rol: 'monitor', id_estudiante: EST, creado_en: '2026-02-01' },
  ];
  db.estudiantes = [
    { id: EST, nombre_estudiante: 'ANA', codigo_estudiante: '1', nivel_consultorio: 'DERECHO PENAL', correo_estudiante: 'mon@u.co' },
    { id: EST2, nombre_estudiante: 'LUIS', codigo_estudiante: '2', nivel_consultorio: 'DERECHO PENAL', correo_estudiante: null },
  ];
  Object.assign(sesiones, { 'token-admin': ADMIN, 'token-monitor': MONITOR });
  llamadasAuth.length = 0;
});

describe('permisos de /api/monitores', () => {
  it('sin sesión responde 401', async () => {
    expect((await GET(pedir(null))).status).toBe(401);
  });

  it('con una sesión que no existe responde 401', async () => {
    expect((await GET(pedir('token-falso'))).status).toBe(401);
  });

  it('un monitor no puede usarla (403)', async () => {
    expect((await GET(pedir('token-monitor'))).status).toBe(403);
    expect((await POST(pedir('token-monitor', { monitores: [] }))).status).toBe(403);
    expect((await PATCH(pedir('token-monitor', { accion: 'quitar_rol' }), contexto(MONITOR))).status).toBe(403);
  });

  it('el administrador ve la lista de monitores con su ficha', async () => {
    const r = await GET(pedir('token-admin'));
    expect(r.status).toBe(200);
    const { monitores } = await r.json();
    expect(monitores).toHaveLength(1);
    expect(monitores[0]).toMatchObject({ id: MONITOR, nombre: 'ANA', codigo: '1' });
  });
});

describe('asignar monitores (POST)', () => {
  const asignar = async (solicitud: Fila) => (await (await POST(pedir('token-admin', { monitores: [solicitud] }))).json()).resultados[0];

  it('valida correo, contraseña y estudiante', async () => {
    expect((await asignar({ id_estudiante: EST2, correo: 'sin-arroba', password: '123456' })).error).toBe('El correo no es válido.');
    expect((await asignar({ id_estudiante: EST2, correo: 'luis@u.co', password: '123' })).error).toMatch(/al menos 6/);
    expect((await asignar({ id_estudiante: 'no-es-uuid', correo: 'luis@u.co', password: '123456' })).error).toBe('Estudiante no válido.');
    expect(llamadasAuth).toHaveLength(0);
  });

  it('no permite reutilizar el correo de un administrador', async () => {
    expect((await asignar({ id_estudiante: EST2, correo: 'admin@u.co', password: '123456' })).error).toBe('Ese correo pertenece a un administrador.');
  });

  it('crea la cuenta y la deja como monitor vinculada al estudiante', async () => {
    const r = await asignar({ id_estudiante: EST2, correo: 'Luis@U.co', password: '123456' });
    expect(r).toEqual({ id_estudiante: EST2, ok: true });
    const nueva = db.usuarios.find((u) => u.id_estudiante === EST2);
    expect(nueva).toMatchObject({ correo: 'luis@u.co', rol: 'monitor' });
  });

  it('rechaza solicitudes vacías o demasiado grandes', async () => {
    expect((await POST(pedir('token-admin', { monitores: [] }))).status).toBe(400);
    expect((await POST(pedir('token-admin', { monitores: Array(101).fill({}) }))).status).toBe(400);
  });
});

describe('editar o quitar rol (PATCH)', () => {
  it('quitar el rol bloquea la cuenta y la deja inactiva, sin borrar nada', async () => {
    const r = await PATCH(pedir('token-admin', { accion: 'quitar_rol' }), contexto(MONITOR));
    expect(r.status).toBe(200);
    expect(db.usuarios.find((u) => u.id === MONITOR)?.rol).toBe('inactivo');
    expect(llamadasAuth).toEqual([{ accion: 'actualizar', datos: { id: MONITOR, ban_duration: '876000h' } }]);
  });

  it('no se puede quitar el rol a quien no es monitor', async () => {
    expect((await PATCH(pedir('token-admin', { accion: 'quitar_rol' }), contexto(ADMIN))).status).toBe(409);
  });

  it('valida el id y el correo nuevo', async () => {
    expect((await PATCH(pedir('token-admin', { correo: 'x@y.co' }), contexto('abc'))).status).toBe(400);
    expect((await PATCH(pedir('token-admin', { correo: 'malo' }), contexto(MONITOR))).status).toBe(400);
  });

  it('no permite tomar el correo de otra cuenta', async () => {
    expect((await PATCH(pedir('token-admin', { correo: 'admin@u.co' }), contexto(MONITOR))).status).toBe(409);
  });
});
