// Utilidades pequeñas que se usan en varias pantallas (y en las rutas de la API).

// Mensaje legible de cualquier error: Error de JavaScript o error de Supabase ({ message }).
export function mensajeDe(e: unknown, porDefecto = 'Ocurrió un error.'): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return porDefecto;
}

// Para buscar sin importar tildes ni mayúsculas: "Álvarez " -> "alvarez"
export const normalizar = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const dos = (n: number) => String(n).padStart(2, '0');

// Fecha de hoy (AAAA-MM-DD) en la zona horaria del navegador (toISOString usaría UTC y a veces da el día siguiente)
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// 'AAAA-MM-DD…' -> 'DD/MM/AAAA'
export function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

// El N.º de asesoría se guarda como texto: compara como número cuando ambos lo son.
// Devuelve 0 si no se pueden comparar como números (cada pantalla decide cómo desempatar).
export function difNumerica(a: string | null, b: string | null): number {
  const x = Number(a), y = Number(b);
  return Number.isNaN(x) || Number.isNaN(y) ? 0 : x - y;
}

// Supabase entrega como máximo 1000 filas por consulta: esta función pide bloque tras bloque hasta traerlas todas.
export async function traerTodo<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const TAM = 1000;
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await pedir(desde, desde + TAM - 1);
    if (error) throw new Error(error.message);
    todo.push(...(data ?? []));
    if ((data?.length ?? 0) < TAM) break;
  }
  return todo;
}

// Descarga un archivo generado en el navegador (PDF, Excel…)
export function descargarBlob(contenido: BlobPart, nombre: string, tipo: string) {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
}

export const TIPO_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Una relación de Supabase ( tabla ( columnas ) ) puede llegar como objeto o como lista de uno: siempre el objeto.
export const uno = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
