import { supabase } from '@/lib/supabase';

export type Monitor = {
  id: string;
  correo: string;
  creado_en: string | null;
  id_estudiante: string | null;
  nombre: string | null;
  codigo: string | null;
  nivel: string | null;
};

export type SolicitudMonitor = { id_estudiante: string; correo: string; password: string };
export type ResultadoMonitor = { id_estudiante: string; ok: boolean; error?: string };

// Llama a las rutas /api/monitores enviando la sesión del administrador.
async function llamar<T>(url: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const respuesta = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se pudo completar la operación.');
  return cuerpo as T;
}

export const listarMonitores = () => llamar<{ monitores: Monitor[] }>('/api/monitores').then((r) => r.monitores);

export const asignarMonitores = (monitores: SolicitudMonitor[]) =>
  llamar<{ resultados: ResultadoMonitor[] }>('/api/monitores', {
    method: 'POST',
    body: JSON.stringify({ monitores }),
  }).then((r) => r.resultados);

export const editarCredenciales = (id: string, datos: { correo: string; password?: string }) =>
  llamar<{ ok: true }>(`/api/monitores/${id}`, { method: 'PATCH', body: JSON.stringify(datos) });

export const quitarRolMonitor = (id: string) =>
  llamar<{ ok: true }>(`/api/monitores/${id}`, { method: 'PATCH', body: JSON.stringify({ accion: 'quitar_rol' }) });

// Contraseña aleatoria legible (sin caracteres que se confunden: 0/O, 1/l/I)
export function generarPassword(largo = 10): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}
