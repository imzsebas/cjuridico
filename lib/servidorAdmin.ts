// SOLO SERVIDOR: se importa únicamente desde app/api/**. Usa la clave service_role,
// que nunca debe llegar al navegador (por eso la variable NO empieza con NEXT_PUBLIC_).
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export function clienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status });

// Verifica que quien llama sea un administrador activo (token de sesión en el encabezado Authorization).
export async function exigirAdministrador(
  req: NextRequest
): Promise<{ admin: SupabaseClient; userId: string } | { error: Response }> {
  let admin: SupabaseClient;
  try {
    admin = clienteAdmin();
  } catch (e) {
    return { error: json({ error: (e as Error).message }, 500) };
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'No autenticado.' }, 401) };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: 'Sesión no válida.' }, 401) };

  const { data: perfil } = await admin.from('usuarios').select('rol').eq('id', data.user.id).single();
  if (perfil?.rol !== 'administrador') return { error: json({ error: 'Solo el administrador puede hacer esto.' }, 403) };

  return { admin, userId: data.user.id };
}

export const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 6; // igual que el formulario de inicio de sesión

// Bloqueo prácticamente permanente (≈100 años) para quien pierde el rol.
export const BLOQUEO = '876000h';
