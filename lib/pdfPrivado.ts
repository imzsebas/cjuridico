import { supabase } from '@/lib/supabase';

export const BUCKET_RECEPCIONES = 'recepciones';

// En la base pueden convivir dos formas de guardar el PDF en recepciones.pdf_url:
//  - registros viejos: la URL pública completa (…/object/public/recepciones/archivo.pdf)
//  - registros nuevos: solo la ruta dentro del bucket (archivo.pdf)
// Esta función devuelve siempre la ruta dentro del bucket.
export function rutaDePdf(pdfUrl: string | null | undefined): string {
  if (!pdfUrl) return '';
  const marca = `/${BUCKET_RECEPCIONES}/`;
  const i = pdfUrl.lastIndexOf(marca);
  const ruta = i >= 0 ? pdfUrl.slice(i + marca.length) : pdfUrl;
  try {
    return decodeURIComponent(ruta.split('?')[0]);
  } catch {
    return ruta.split('?')[0];
  }
}

// El bucket es privado: se pide un enlace firmado que vence en 60 segundos.
export async function urlFirmadaPdf(pdfUrl: string | null | undefined): Promise<string> {
  const ruta = rutaDePdf(pdfUrl);
  if (!ruta) throw new Error('Este registro no tiene PDF guardado.');
  const { data, error } = await supabase.storage.from(BUCKET_RECEPCIONES).createSignedUrl(ruta, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo abrir el PDF.');
  return data.signedUrl;
}

// Abre el PDF en una pestaña nueva. La pestaña se abre antes de pedir el enlace para que
// el navegador no la bloquee como ventana emergente.
export async function abrirPdf(pdfUrl: string | null | undefined): Promise<void> {
  const ventana = window.open('', '_blank');
  try {
    const url = await urlFirmadaPdf(pdfUrl);
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
  } catch (err) {
    ventana?.close();
    throw err;
  }
}
