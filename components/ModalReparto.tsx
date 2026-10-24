'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TIPO_EXCEL, descargarBlob, difNumerica, hoyLocal, mensajeDe, traerTodo, uno } from '@/lib/utilidades';
import Modal from '@/components/Modal';

// Modal "Generar reparto": pide una fecha o un lapso y descarga un Excel con las asesorías
// asignadas en ese periodo (solo asignaciones activas). Si el lapso dura más de un mes,
// el Excel trae una hoja por cada mes del lapso.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type FilaReparto = { asesoria: string; usuario: string; area: string; fecha: string; asunto: string; estudiante: string; reasignacion: boolean };

type Recepcion = { asesoria_no: string | null; nombres_apellidos: string | null; area_derecho: string | null; naturaleza_asunto: string | null };
type FilaBD = {
  fecha_asignacion: string;
  asesoria_no: string | null;
  es_reasignacion: boolean | null;
  estudiantes: { nombre_estudiante: string } | { nombre_estudiante: string }[] | null;
  recepciones: Recepcion | Recepcion[] | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

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
  const datos = await traerTodo<FilaBD>((d, h) =>
    supabase
      .from('asignaciones')
      .select(
        'fecha_asignacion, asesoria_no, es_reasignacion, estudiantes ( nombre_estudiante ), recepciones ( asesoria_no, nombres_apellidos, area_derecho, naturaleza_asunto )'
      )
      .eq('activa', true)
      .gte('fecha_asignacion', desde)
      .lte('fecha_asignacion', hasta)
      .order('fecha_asignacion')
      .order('id')
      .range(d, h)
      .overrideTypes<FilaBD[], { merge: false }>()
  );
  const filas = datos.map((r) => {
    const rec = uno(r.recepciones);
    return {
      asesoria: rec?.asesoria_no ?? r.asesoria_no ?? '',
      usuario: rec?.nombres_apellidos ?? '',
      area: rec?.area_derecho ?? '',
      fecha: r.fecha_asignacion,
      asunto: rec?.naturaleza_asunto ?? '',
      estudiante: uno(r.estudiantes)?.nombre_estudiante ?? '',
      reasignacion: r.es_reasignacion === true,
    };
  });
  // Por fecha y, dentro de cada fecha, por número de asesoría
  return filas.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) ||
    difNumerica(a.asesoria, b.asesoria) ||
    a.asesoria.localeCompare(b.asesoria) ||
    a.estudiante.localeCompare(b.estudiante)
  );
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

  const ENCABEZADOS = ['NÚMERO DE ASESORÍA', 'USUARIO', 'ÁREA', 'FECHA DE REPARTO', 'ASUNTO', 'ESTUDIANTE ASIGNADO'];
  const ANCHOS = [22, 22, 42, 26, 22, 46, 44];

  hojas.forEach((h) => {
    const hoja = libro.addWorksheet(h.nombre);
    ANCHOS.forEach((w, i) => { hoja.getColumn(i + 1).width = w; });

    // Cada bloque: fila de encabezado (con "ASIGNACIÓN" o "REASIGNACIÓN" en la columna A) + sus filas.
    // Entre un bloque y otro queda una fila en blanco. Si un bloque no tiene filas, no se escribe.
    const bloques = [
      { etiqueta: 'ASIGNACIÓN', filas: h.filas.filter((f) => !f.reasignacion) },
      { etiqueta: 'REASIGNACIÓN', filas: h.filas.filter((f) => f.reasignacion) },
    ].filter((b, i) => b.filas.length > 0 || (i === 0 && h.filas.length === 0));

    bloques.forEach((b, idx) => {
      if (idx > 0) hoja.addRow([]); // fila en blanco entre bloques

      const cab = hoja.addRow([b.etiqueta, ...ENCABEZADOS]);
      cab.height = 50;
      cab.eachCell((celda, col) => {
        celda.border = bordes;
        celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        celda.font = { size: 12, bold: true, color: { argb: 'FF000000' } };
        celda.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: col === 1 ? 'FF92D050' : 'FFFFFF00' }, // A en verde, el resto amarillo
        };
      });

      // Misma asesoría (y misma fecha) con varios estudiantes → una sola fila,
      // con los estudiantes uno debajo del otro en la última columna.
      const grupos: { base: FilaReparto; estudiantes: string[] }[] = [];
      const indice = new Map<string, number>();
      b.filas.forEach((f, n) => {
        const clave = f.asesoria ? `${f.asesoria}|${f.fecha}` : `sin-numero-${n}`;
        const pos = indice.get(clave);
        if (pos === undefined) {
          indice.set(clave, grupos.length);
          grupos.push({ base: f, estudiantes: f.estudiante ? [f.estudiante] : [] });
        } else if (f.estudiante && !grupos[pos].estudiantes.includes(f.estudiante)) {
          grupos[pos].estudiantes.push(f.estudiante);
        }
      });

      grupos.forEach(({ base: f, estudiantes }) => {
        const [a, m, d] = partes(f.fecha);
        const fila = hoja.addRow([
          null, // columna A: vacía en las filas de datos
          f.asesoria.toUpperCase(),
          f.usuario.toUpperCase(),
          f.area.toUpperCase(),
          new Date(Date.UTC(a, m - 1, d)),
          f.asunto.toUpperCase(),
          estudiantes.map((e) => e.toUpperCase()).join('\n'),
        ]);
        fila.height = Math.max(50, 20 * estudiantes.length + 10);
        for (let col = 2; col <= 7; col++) {
          const celda = fila.getCell(col);
          celda.border = bordes;
          celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          celda.font = { size: 12, bold: false, color: { argb: 'FF000000' } };
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          if (col === 5) celda.numFmt = 'dd/mm/yyyy';
        }
      });
    });

  });

  const nombre =
    desde === hasta
      ? `Notificación de reparto (${nombreArchivoFecha(desde)}).xlsx`
      : `Notificación de reparto (${nombreArchivoFecha(desde)} a ${nombreArchivoFecha(hasta)}).xlsx`;

  descargarBlob(await libro.xlsx.writeBuffer(), nombre, TIPO_EXCEL);
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
      setError(mensajeDe(e, 'No se pudo generar el Excel.'));
      setGenerando(false);
    }
  }

  return (
    <Modal
      onFuera={() => !generando && onCerrar()}
      acciones={
        <>
          <button className="btn-secundario" onClick={onCerrar} disabled={generando}>Cancelar</button>
          <button className="btn-primary" onClick={generar} disabled={generando}>{generando ? 'Generando...' : 'Generar Excel'}</button>
        </>
      }
    >
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
    </Modal>
  );
}