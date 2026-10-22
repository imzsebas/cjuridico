'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// Modal "Generar reparto": pide una fecha o un lapso y descarga un Excel con las asesorías
// asignadas en ese periodo (solo asignaciones activas). Si el lapso dura más de un mes,
// el Excel trae una hoja por cada mes del lapso.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type FilaReparto = { asesoria: string; usuario: string; area: string; fecha: string; asunto: string; estudiante: string };

type FilaBD = {
  fecha_asignacion: string;
  asesoria_no: string | null;
  estudiantes: { nombre_estudiante: string } | { nombre_estudiante: string }[] | null;
  recepciones:
    | { asesoria_no: string | null; nombres_apellidos: string | null; area_derecho: string | null; naturaleza_asunto: string | null }
    | { asesoria_no: string | null; nombres_apellidos: string | null; area_derecho: string | null; naturaleza_asunto: string | null }[]
    | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

// Fecha de hoy en la zona horaria del navegador (no en UTC)
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const partes = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const verFecha = (iso: string) => { const [a, m, d] = partes(iso); return `${pad(d)}/${pad(m)}/${a}`; };
const nombreArchivoFecha = (iso: string) => { const [a, m, d] = partes(iso); return `${pad(d)}-${pad(m)}-${a}`; };

// ¿El lapso es mayor a un mes? (hasta pasa de "desde + 1 mes")
function masDeUnMes(desde: string, hasta: string): boolean {
  const [y, m, d] = partes(desde);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const diasDelMes = new Date(ny, nm, 0).getDate();
  return hasta > `${ny}-${pad(nm)}-${pad(Math.min(d, diasDelMes))}`;
}

// Cada mes (año, mes) que toca el lapso, de principio a fin
function mesesEntre(desde: string, hasta: string): { y: number; m: number }[] {
  const [y1, m1] = partes(desde);
  const [y2, m2] = partes(hasta);
  const lista: { y: number; m: number }[] = [];
  for (let y = y1, m = m1; y < y2 || (y === y2 && m <= m2); m === 12 ? (y++, (m = 1)) : m++) lista.push({ y, m });
  return lista;
}

async function traerReparto(desde: string, hasta: string): Promise<FilaReparto[]> {
  const TAM = 1000;
  const filas: FilaReparto[] = [];
  for (let ini = 0; ; ini += TAM) {
    const { data, error } = await supabase
      .from('asignaciones')
      .select(
        'fecha_asignacion, asesoria_no, estudiantes ( nombre_estudiante ), recepciones ( asesoria_no, nombres_apellidos, area_derecho, naturaleza_asunto )'
      )
      .eq('activa', true)
      .gte('fecha_asignacion', desde)
      .lte('fecha_asignacion', hasta)
      .order('fecha_asignacion')
      .order('id')
      .range(ini, ini + TAM - 1);
    if (error) throw new Error(error.message);
    (data as unknown as FilaBD[] | null ?? []).forEach((r) => {
      const rec = Array.isArray(r.recepciones) ? r.recepciones[0] : r.recepciones;
      const est = Array.isArray(r.estudiantes) ? r.estudiantes[0] : r.estudiantes;
      filas.push({
        asesoria: rec?.asesoria_no ?? r.asesoria_no ?? '',
        usuario: rec?.nombres_apellidos ?? '',
        area: rec?.area_derecho ?? '',
        fecha: r.fecha_asignacion,
        asunto: rec?.naturaleza_asunto ?? '',
        estudiante: est?.nombre_estudiante ?? '',
      });
    });
    if ((data?.length ?? 0) < TAM) break;
  }
  // Por fecha y, dentro de cada fecha, por número de asesoría
  return filas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    const na = Number(a.asesoria), nb = Number(b.asesoria);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.asesoria.localeCompare(b.asesoria) || a.estudiante.localeCompare(b.estudiante);
  });
}

async function crearExcel(filas: FilaReparto[], desde: string, hasta: string, dividirPorMes: boolean) {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();

  const hojas = dividirPorMes
    ? mesesEntre(desde, hasta).map(({ y, m }) => ({
        nombre: `${MESES[m - 1]} ${y}`,
        filas: filas.filter((f) => f.fecha.startsWith(`${y}-${pad(m)}-`)),
      }))
    : [{ nombre: desde === hasta ? nombreArchivoFecha(desde) : `${nombreArchivoFecha(desde)} a ${nombreArchivoFecha(hasta)}`, filas }];

  const borde = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  hojas.forEach((h) => {
    const hoja = libro.addWorksheet(h.nombre);
    hoja.columns = [
      { header: 'NÚMERO DE ASESORÍA', key: 'asesoria', width: 22 },
      { header: 'USUARIO', key: 'usuario', width: 42 },
      { header: 'ÁREA', key: 'area', width: 26 },
      { header: 'FECHA DE REPARTO', key: 'fecha', width: 22 },
      { header: 'ASUNTO', key: 'asunto', width: 46 },
      { header: 'ESTUDIANTE ASIGNADO', key: 'estudiante', width: 44 },
    ];

    h.filas.forEach((f) => {
      const [a, m, d] = partes(f.fecha);
      hoja.addRow({
        asesoria: f.asesoria.toUpperCase(),
        usuario: f.usuario.toUpperCase(),
        area: f.area.toUpperCase(),
        fecha: new Date(Date.UTC(a, m - 1, d)),
        asunto: f.asunto.toUpperCase(),
        estudiante: f.estudiante.toUpperCase(),
      });
    });

    // Todo el texto: tamaño 12, centrado (horizontal y vertical), con bordes y fila de 50 pt.
    // Cabecera amarilla (#FFFF00) en negrita; el resto de la tabla en blanco.
    hoja.eachRow((fila, n) => {
      fila.height = 50;
      fila.eachCell((celda) => {
        celda.border = bordes;
        celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        celda.font = { size: 12, bold: n === 1, color: { argb: 'FF000000' } };
        celda.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: n === 1 ? 'FFFFFF00' : 'FFFFFFFF' },
        };
      });
    });
    hoja.getColumn('fecha').numFmt = 'dd/mm/yyyy';
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
  });

  const nombre =
    desde === hasta
      ? `Notificación de reparto (${nombreArchivoFecha(desde)}).xlsx`
      : `Notificación de reparto (${nombreArchivoFecha(desde)} a ${nombreArchivoFecha(hasta)}).xlsx`;

  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export default function ModalReparto({ onCerrar }: { onCerrar: () => void }) {
  const [modo, setModo] = useState<'fecha' | 'lapso'>('fecha');
  const [desde, setDesde] = useState(hoyLocal());
  const [hasta, setHasta] = useState(hoyLocal());
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inicio = desde;
  const fin = modo === 'fecha' ? desde : hasta;
  const dividir = modo === 'lapso' && !!inicio && !!fin && inicio <= fin && masDeUnMes(inicio, fin);
  const cantidadHojas = dividir ? mesesEntre(inicio, fin).length : 1;

  async function generar() {
    if (!inicio || !fin) { setError('Escribe la fecha.'); return; }
    if (inicio > fin) { setError('La fecha "Desde" no puede ser posterior a "Hasta".'); return; }
    setGenerando(true);
    setError(null);
    try {
      const filas = await traerReparto(inicio, fin);
      if (filas.length === 0) {
        setError(inicio === fin ? `No hay asesorías repartidas el ${verFecha(inicio)}.` : `No hay asesorías repartidas entre el ${verFecha(inicio)} y el ${verFecha(fin)}.`);
        setGenerando(false);
        return;
      }
      await crearExcel(filas, inicio, fin, dividir);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el Excel.');
      setGenerando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !generando && onCerrar()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-cuerpo">
          <h3>Generar reparto</h3>

          <div className="rep-modos">
            <button type="button" className={`rep-modo${modo === 'fecha' ? ' activo' : ''}`} onClick={() => { setModo('fecha'); setError(null); }}>
              Fecha específica
            </button>
            <button type="button" className={`rep-modo${modo === 'lapso' ? ' activo' : ''}`} onClick={() => { setModo('lapso'); setError(null); }}>
              Lapso de tiempo
            </button>
          </div>

          <div className={`rep-fechas${modo === 'fecha' ? ' una' : ''}`}>
            <div className="field">
              <label htmlFor="rep-desde">{modo === 'fecha' ? 'Fecha del reparto' : 'Desde'}</label>
              <input id="rep-desde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setError(null); }} />
            </div>
            {modo === 'lapso' && (
              <div className="field">
                <label htmlFor="rep-hasta">Hasta</label>
                <input id="rep-hasta" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setError(null); }} />
              </div>
            )}
          </div>

          {dividir && <p className="rep-nota">El lapso es mayor a un mes: el Excel tendrá una hoja por cada mes ({cantidadHojas} hojas).</p>}
          {error && <div className="form-message error" style={{ margin: '14px 0 0' }}>{error}</div>}
        </div>

        <div className="modal-acciones modal-acciones-compactas">
          <button className="btn-secundario" onClick={onCerrar} disabled={generando}>Cancelar</button>
          <button className="btn-primary" onClick={generar} disabled={generando}>{generando ? 'Generando...' : 'Generar Excel'}</button>
        </div>
      </div>
    </div>
  );
}