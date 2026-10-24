// Lo que comparten "Libro de asesorías" (administrador) y "Mis recepciones" (monitor):
// el tipo de cada fila, el periodo académico, la exportación a Excel y la descarga del formato.

import { supabase } from '@/lib/supabase';
import { descargarArchivo, generarPdfRecepcion, valoresDesdeFila } from '@/lib/formatoRecepcion';
import { TIPO_EXCEL, descargarBlob, difNumerica } from '@/lib/utilidades';

export type Registro = {
  id_recepcion: string | null;
  asesoria_no: string | null;
  fecha: string | null;
  nombres_apellidos: string | null;
  cedula_numero: string | null;
  area_derecho: string | null;
  direccion: string | null;
  contacto_1: string | null;
  correo: string | null;
  estudiante_recepciona_nombre: string | null;
  naturaleza_asunto: string | null;
  fecha_asignacion: string | null;
  nombre_estudiante: string | null;
  codigo_estudiante: string | null;
  pdf_url: string | null;
};

// Acepta "DD/MM/AAAA" y también "D/M/AA" (sin ceros a la izquierda, año corto)
export function parsearFecha(fecha: string | null): { anio: number; periodo: 'I' | 'II' } | null {
  if (!fecha) return null;
  const partes = fecha.trim().split('/');
  if (partes.length !== 3) return null;
  const mes = parseInt(partes[1], 10);
  let anio = parseInt(partes[2], 10);
  if (Number.isNaN(mes) || Number.isNaN(anio) || mes < 1 || mes > 12) return null;
  if (partes[2].length <= 2) anio += 2000;
  return { anio, periodo: mes <= 6 ? 'I' : 'II' };
}

// "2026-II" (va en su propia columna de la tabla)
export function periodoDe(fecha: string | null) {
  const info = parsearFecha(fecha);
  return info ? `${info.anio}-${info.periodo}` : null;
}

// Más recientes primero. El N.º es texto: se compara como número cuando se puede.
export const ordenarPorNumero = (lista: Registro[]) =>
  lista.sort((x, y) => difNumerica(y.asesoria_no, x.asesoria_no) || (y.asesoria_no ?? '').localeCompare(x.asesoria_no ?? ''));

// ───────── Orden por número en la base de datos ─────────
// Ordenar la columna de texto "asesoria_no" pone "98" antes que "161". Si en Supabase se agrega la columna
// numérica "asesoria_num" (supabase/mejoras.sql), se ordena por ella; mientras no exista, se usa el orden anterior.
let sinColumnaNumerica = false;

type RespuestaPagina<T> = { data: T[] | null; error: { code?: string; message: string } | null; count: number | null };

export async function consultarOrdenado<T>(
  pedir: (columna: 'asesoria_num' | 'asesoria_no') => PromiseLike<RespuestaPagina<T>>
): Promise<RespuestaPagina<T>> {
  if (!sinColumnaNumerica) {
    const r = await pedir('asesoria_num');
    const falta = r.error && (r.error.code === '42703' || r.error.message.includes('asesoria_num'));
    if (!falta) return r;
    sinColumnaNumerica = true;
  }
  return pedir('asesoria_no');
}

// ───────── Exportar a Excel ─────────

const COLUMNAS_EXPORTACION: [encabezado: string, ancho: number, campo: keyof Registro][] = [
  ['NUMERO DE ASESORIA', 16, 'asesoria_no'],
  ['NOMBRE DEL USUARIO', 28, 'nombres_apellidos'],
  ['FECHA DE LA ATENCION', 16, 'fecha'],
  ['NUMERO DE CEDULA', 16, 'cedula_numero'],
  ['AREA', 18, 'area_derecho'],
  ['DIRECCION', 28, 'direccion'],
  ['CORREO ELECTRONICO', 26, 'correo'],
  ['TELEFONO', 15, 'contacto_1'],
  ['MONITOR ENCARGADO', 26, 'estudiante_recepciona_nombre'],
  ['ASUNTO', 32, 'naturaleza_asunto'],
  ['FECHA DEL REPARTO', 16, 'fecha_asignacion'],
  ['ESTUDIANTE ASIGNADO', 26, 'nombre_estudiante'],
  ['CÓDIGO', 14, 'codigo_estudiante'],
];

// Excel con todas las asesorías: por año (más reciente primero), dentro de cada año el periodo II antes que el I,
// y dentro de cada periodo por N.º de asesoría. Las que no tienen fecha válida van al final.
export async function exportarExcel(registros: Registro[], nombreHoja: string, prefijoArchivo: string) {
  const ExcelJS = (await import('exceljs')).default;
  const clave = (r: Registro) => {
    const p = parsearFecha(r.fecha);
    return p ? p.anio * 10 + (p.periodo === 'II' ? 2 : 1) : -1;
  };
  const filas = ordenarPorNumero([...registros]).sort((a, b) => clave(b) - clave(a)); // sort es estable

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Consultorio Jurídico';
  libro.created = new Date();
  const hoja = libro.addWorksheet(nombreHoja, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = COLUMNAS_EXPORTACION.map(([, ancho]) => ({ width: ancho }));

  const borde = { style: 'thin' as const, color: { argb: 'FF0D2A1C' } };
  const titulo = hoja.addRow(COLUMNAS_EXPORTACION.map(([encabezado]) => encabezado));
  titulo.height = 24;
  titulo.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123524' } };
    celda.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.border = { top: borde, bottom: borde, left: borde, right: borde };
  });

  filas.forEach((r, indice) => {
    const fila = hoja.addRow(COLUMNAS_EXPORTACION.map(([, , campo]) => (r[campo] ?? '').toString().toUpperCase()));
    fila.eachCell((celda) => {
      celda.alignment = { vertical: 'middle', wrapText: true };
      celda.border = { bottom: { style: 'thin', color: { argb: 'FFE0E6E1' } } };
      if (indice % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2EE' } };
    });
  });

  const fecha = new Date().toISOString().slice(0, 10);
  descargarBlob(await libro.xlsx.writeBuffer(), `${prefijoArchivo}_${fecha}.xlsx`, TIPO_EXCEL);
}

// Vuelve a llenar el formato PDF con los datos que hay hoy en la base de datos
export async function descargarFormato(r: Registro) {
  if (!r.id_recepcion) return;
  const { data, error } = await supabase.from('recepciones').select('*').eq('id', r.id_recepcion).single();
  if (error) throw error;
  const bytes = await generarPdfRecepcion(valoresDesdeFila(data));
  descargarArchivo(bytes, `formato-recepcion-${r.asesoria_no ?? 'sin-numero'}.pdf`);
}

// ───────── Búsqueda y filtros (Libro de asesorías y Mis recepciones) ─────────

export type Filtros = { texto: string; area: string; periodo: string };
export const SIN_FILTROS: Filtros = { texto: '', area: '', periodo: '' };
export const hayFiltros = (f: Filtros) => Boolean(f.texto || f.area || f.periodo);

// Lo único que se usa de la consulta de Supabase (así TypeScript no tiene que deducir sus tipos completos)
type Filtrable = { or(filtros: string): Filtrable; eq(columna: string, valor: string): Filtrable };

// Agrega los filtros a una consulta de "libro_asesorias" o de "recepciones" (tienen las mismas columnas).
// El texto se busca a la vez en el N.º de asesoría, el nombre del usuario y la cédula.
export function aplicarFiltros<Q>(consulta: Q, f: Filtros): Q {
  let q = consulta as unknown as Filtrable;
  const texto = f.texto.replace(/[,()"\\*%]/g, ' ').trim(); // caracteres que la sintaxis de búsqueda no admite
  if (texto) {
    const v = `"*${texto}*"`;
    q = q.or(`asesoria_no.ilike.${v},nombres_apellidos.ilike.${v},cedula_numero.ilike.${v}`);
  }
  if (f.area) q = q.eq('area_derecho', f.area);
  if (f.periodo) q = q.eq('periodo', f.periodo);
  return q as unknown as Q;
}
