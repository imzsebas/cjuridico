import type { NextRequest } from 'next/server';
import { BLOQUEO, ES_CORREO, ES_UUID, MIN_PASSWORD, exigirAdministrador, json } from '@/lib/servidorAdmin';

// PATCH /api/monitores/[id]
//   { correo?, password? }      → edita las credenciales del monitor (contraseña vacía = no se cambia)
//   { accion: 'quitar_rol' }    → quita el rol de monitor
//
// IMPORTANTE: quitar el rol NUNCA borra nada. No se elimina ni la cuenta ni la fila de `usuarios`
// (recepciones.monitor_id apunta a ella) ni las recepciones, asignaciones o PDFs. Solo se:
//   1) bloquea el ingreso de la cuenta, y
//   2) cambia su rol a 'inactivo' para que no aparezca en la lista.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdministrador(req);
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  const { id } = await ctx.params;
  if (!ES_UUID.test(id)) return json({ error: 'Monitor no válido.' }, 400);

  let cuerpo: { correo?: string; password?: string; accion?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Solicitud no válida.' }, 400);
  }

  const { data: usuario } = await admin.from('usuarios').select('id, rol, correo').eq('id', id).maybeSingle();
  if (!usuario) return json({ error: 'No se encontró el monitor.' }, 404);
  if (usuario.rol !== 'monitor') return json({ error: 'Esta cuenta no es un monitor activo.' }, 409);

  // ── Quitar rol ──
  if (cuerpo.accion === 'quitar_rol') {
    const { error: errBan } = await admin.auth.admin.updateUserById(id, { ban_duration: BLOQUEO });
    if (errBan) return json({ error: errBan.message }, 500);

    const { error: errRol } = await admin.from('usuarios').update({ rol: 'inactivo' }).eq('id', id);
    if (errRol) {
      await admin.auth.admin.updateUserById(id, { ban_duration: 'none' }); // deshace el bloqueo
      return json({ error: errRol.message }, 500);
    }
    return json({ ok: true });
  }

  // ── Editar credenciales ──
  const correo = cuerpo.correo === undefined ? undefined : String(cuerpo.correo).trim().toLowerCase();
  const password = cuerpo.password ? String(cuerpo.password) : undefined;

  if (correo !== undefined && !ES_CORREO.test(correo)) return json({ error: 'El correo no es válido.' }, 400);
  if (password !== undefined && password.length < MIN_PASSWORD) {
    return json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` }, 400);
  }
  const cambiaCorreo = correo !== undefined && correo !== usuario.correo;
  if (!cambiaCorreo && password === undefined) return json({ ok: true }); // nada que cambiar

  if (cambiaCorreo) {
    const { data: otro } = await admin.from('usuarios').select('id').eq('correo', correo!).maybeSingle();
    if (otro && otro.id !== id) return json({ error: 'Ese correo ya pertenece a otra cuenta.' }, 409);
  }

  const { error: errAuth } = await admin.auth.admin.updateUserById(id, {
    ...(cambiaCorreo ? { email: correo, email_confirm: true } : {}),
    ...(password !== undefined ? { password } : {}),
  });
  if (errAuth) return json({ error: errAuth.message }, 400);

  if (cambiaCorreo) {
    const { error: errUsr } = await admin.from('usuarios').update({ correo }).eq('id', id);
    if (errUsr) return json({ error: errUsr.message }, 500);
  }
  return json({ ok: true });
}
