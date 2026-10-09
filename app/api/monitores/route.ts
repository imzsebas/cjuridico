import type { NextRequest } from 'next/server';
import { ES_CORREO, ES_UUID, MIN_PASSWORD, exigirAdministrador, json } from '@/lib/servidorAdmin';

// GET /api/monitores → monitores activos (rol = 'monitor') con los datos de su ficha de estudiante.
export async function GET(req: NextRequest) {
  const auth = await exigirAdministrador(req);
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  const { data: usuarios, error } = await admin
    .from('usuarios')
    .select('id, correo, creado_en, id_estudiante')
    .eq('rol', 'monitor')
    .order('creado_en', { ascending: false });
  if (error) return json({ error: error.message }, 500);

  type Ficha = { id: string; nombre_estudiante: string; codigo_estudiante: string; nivel_consultorio: string; correo_estudiante: string | null };
  const cols = 'id, nombre_estudiante, codigo_estudiante, nivel_consultorio, correo_estudiante';

  // 1) Fichas vinculadas explícitamente
  const ids = (usuarios ?? []).map((u) => u.id_estudiante).filter((x): x is string => !!x);
  const porId = new Map<string, Ficha>();
  if (ids.length > 0) {
    const { data: est, error: errEst } = await admin.from('estudiantes').select(cols).in('id', ids);
    if (errEst) return json({ error: errEst.message }, 500);
    (est ?? []).forEach((e) => porId.set(e.id, e));
  }

  // 2) Monitores creados a mano (sin vínculo): se busca su ficha por el correo, solo para mostrar el nombre.
  //    No se guarda nada; si dos estudiantes comparten correo, no se adivina.
  const porCorreo = new Map<string, Ficha | null>();
  if ((usuarios ?? []).some((u) => !u.id_estudiante)) {
    const TAM = 1000;
    for (let desde = 0; ; desde += TAM) {
      const { data: lote, error: errLote } = await admin
        .from('estudiantes').select(cols).order('id').range(desde, desde + TAM - 1);
      if (errLote) return json({ error: errLote.message }, 500);
      (lote ?? []).forEach((e) => {
        const c = (e.correo_estudiante ?? '').trim().toLowerCase();
        if (!c) return;
        porCorreo.set(c, porCorreo.has(c) ? null : e);
      });
      if ((lote?.length ?? 0) < TAM) break;
    }
  }

  const monitores = (usuarios ?? []).map((u) => {
    const f = u.id_estudiante ? porId.get(u.id_estudiante) : porCorreo.get((u.correo ?? '').trim().toLowerCase()) ?? undefined;
    return {
      id: u.id,
      correo: u.correo,
      creado_en: u.creado_en,
      id_estudiante: u.id_estudiante,
      nombre: f?.nombre_estudiante ?? null,
      codigo: f?.codigo_estudiante ?? null,
      nivel: f?.nivel_consultorio ?? null,
    };
  });
  return json({ monitores });
}

type Solicitud = { id_estudiante: string; correo: string; password: string };
type Resultado = { id_estudiante: string; ok: boolean; error?: string };

// POST /api/monitores  { monitores: [{ id_estudiante, correo, password }, ...] }
// Convierte a cada estudiante en monitor: crea su cuenta (o reactiva la que ya tenía) con ese correo y contraseña.
export async function POST(req: NextRequest) {
  const auth = await exigirAdministrador(req);
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  let cuerpo: { monitores?: Solicitud[] };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Solicitud no válida.' }, 400);
  }
  const lista = cuerpo.monitores;
  if (!Array.isArray(lista) || lista.length === 0) return json({ error: 'No se indicó ningún estudiante.' }, 400);
  if (lista.length > 100) return json({ error: 'Demasiados estudiantes en una sola solicitud.' }, 400);

  const resultados: Resultado[] = [];

  for (const s of lista) {
    const fallo = (error: string) => resultados.push({ id_estudiante: s?.id_estudiante, ok: false, error });
    const correo = String(s?.correo ?? '').trim().toLowerCase();
    const password = String(s?.password ?? '');

    if (!ES_UUID.test(String(s?.id_estudiante ?? ''))) { fallo('Estudiante no válido.'); continue; }
    if (!ES_CORREO.test(correo)) { fallo('El correo no es válido.'); continue; }
    if (password.length < MIN_PASSWORD) { fallo(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`); continue; }

    const { data: est } = await admin.from('estudiantes').select('id').eq('id', s.id_estudiante).maybeSingle();
    if (!est) { fallo('El estudiante no existe.'); continue; }

    // ¿Ya hay una cuenta para este estudiante, o con este correo?
    const { data: porVinculo } = await admin
      .from('usuarios').select('id, rol, id_estudiante').eq('id_estudiante', s.id_estudiante).maybeSingle();
    const { data: porCorreo } = await admin
      .from('usuarios').select('id, rol, id_estudiante').eq('correo', correo).maybeSingle();

    if (porVinculo && porCorreo && porVinculo.id !== porCorreo.id) {
      fallo('Ese correo ya pertenece a otra cuenta. Usa otro correo.');
      continue;
    }
    const existente = porVinculo ?? porCorreo;

    if (existente) {
      if (existente.rol === 'administrador') { fallo('Ese correo pertenece a un administrador.'); continue; }
      if (existente.id_estudiante && existente.id_estudiante !== s.id_estudiante) {
        fallo('Ese correo ya es de otro monitor.');
        continue;
      }
      if (existente.rol === 'monitor' && existente.id_estudiante === s.id_estudiante) {
        fallo('Este estudiante ya es monitor.');
        continue;
      }
      // Cuenta que ya existía (rol quitado antes, o monitor creado a mano): se reactiva con las credenciales dadas.
      const { error: errAuth } = await admin.auth.admin.updateUserById(existente.id, {
        email: correo,
        password,
        email_confirm: true,
        ban_duration: 'none',
      });
      if (errAuth) { fallo(errAuth.message); continue; }
      const { error: errUsr } = await admin
        .from('usuarios').update({ rol: 'monitor', correo, id_estudiante: s.id_estudiante }).eq('id', existente.id);
      if (errUsr) { fallo(errUsr.message); continue; }
      resultados.push({ id_estudiante: s.id_estudiante, ok: true });
      continue;
    }

    // Cuenta nueva
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email: correo,
      password,
      email_confirm: true,
    });
    if (errCrear || !creado.user) { fallo(errCrear?.message ?? 'No se pudo crear la cuenta.'); continue; }

    // El trigger handle_new_user ya insertó la fila en `usuarios` (rol monitor); aquí se completa y se vincula.
    const { error: errUsr } = await admin
      .from('usuarios')
      .upsert({ id: creado.user.id, correo, rol: 'monitor', id_estudiante: s.id_estudiante }, { onConflict: 'id' });
    if (errUsr) {
      // La cuenta recién creada aún no tiene ningún dato asociado: es seguro deshacerla.
      await admin.auth.admin.deleteUser(creado.user.id);
      fallo(errUsr.message);
      continue;
    }
    resultados.push({ id_estudiante: s.id_estudiante, ok: true });
  }

  return json({ resultados });
}
