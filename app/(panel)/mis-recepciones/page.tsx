'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import ExcelJS from 'exceljs';

type Registro = {
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
function parsearFecha(fecha: string | null): { anio: number; periodo: 'I' | 'II' } | null {
  if (!fecha) return null;
  const partes = fecha.trim().split('/');
  if (partes.length !== 3) return null;
  const mes = parseInt(partes[1], 10);
  let anio = parseInt(partes[2], 10);
  if (Number.isNaN(mes) || Number.isNaN(anio) || mes < 1 || mes > 12) return null;
  if (partes[2].length <= 2) anio += 2000;
  return { anio, periodo: mes <= 6 ? 'I' : 'II' };
}

const dato = (v: string | null) => v || <span className="sin-dato">—</span>;

// Convierte a mayúsculas de forma segura (respeta null/undefined)
const mayus = (v: string | null | undefined) => (v ?? '').toString().toUpperCase();

// Encabezados exactos solicitados para el libro exportado, con su ancho de columna
const COLUMNAS_EXPORTACION: { encabezado: string; ancho: number }[] = [
  { encabezado: 'NUMERO DE ASESORIA', ancho: 16 },
  { encabezado: 'NOMBRE DEL USUARIO', ancho: 28 },
  { encabezado: 'FECHA DE LA ATENCION', ancho: 16 },
  { encabezado: 'NUMERO DE CEDULA', ancho: 16 },
  { encabezado: 'AREA', ancho: 18 },
  { encabezado: 'DIRECCION', ancho: 28 },
  { encabezado: 'CORREO ELECTRONICO', ancho: 26 },
  { encabezado: 'TELEFONO', ancho: 15 },
  { encabezado: 'MONITOR ENCARGADO', ancho: 26 },
  { encabezado: 'ASUNTO', ancho: 32 },
  { encabezado: 'FECHA DEL REPARTO', ancho: 16 },
  { encabezado: 'ESTUDIANTE ASIGNADO', ancho: 26 },
  { encabezado: 'CÓDIGO', ancho: 14 },
];

function registroAFila(r: Registro) {
  return [
    mayus(r.asesoria_no),
    mayus(r.nombres_apellidos),
    mayus(r.fecha),
    mayus(r.cedula_numero),
    mayus(r.area_derecho),
    mayus(r.direccion),
    mayus(r.correo),
    mayus(r.contacto_1),
    mayus(r.estudiante_recepciona_nombre),
    mayus(r.naturaleza_asunto),
    mayus(r.fecha_asignacion),
    mayus(r.nombre_estudiante),
    mayus(r.codigo_estudiante),
  ];
}

export default function MisRecepcionesPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function alternarDetalle(id: string) {
    setExpandidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  // Solo monitores entran aquí; el administrador tiene su propio Libro de Asesorías
  useEffect(() => {
    let cancelado = false;

    async function verificarYCargar() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }

      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (perfil?.rol === 'administrador') { router.replace('/libro-asesorias'); return; }
      if (perfil?.rol !== 'monitor') { router.replace('/login'); return; }

      // 1. Las recepciones del monitor, directo de la tabla "recepciones" y en bloques de 1000
      //    (así no se topa con el límite de filas de la API).
      const TAM = 1000;
      const propias: Registro[] = [];
      const idPorFila: string[] = [];
      for (let desde = 0; ; desde += TAM) {
        const { data, error: errorPropias } = await supabase
          .from('recepciones')
          .select('id, asesoria_no, fecha, nombres_apellidos, cedula_numero, area_derecho, direccion, contacto_1, correo, estudiante_recepciona_nombre, naturaleza_asunto, pdf_url')
          .eq('monitor_id', user.id)
          .order('id')
          .range(desde, desde + TAM - 1);
        if (cancelado) return;
        if (errorPropias) { setError(errorPropias.message); setCargando(false); return; }
        (data ?? []).forEach((r) => {
          idPorFila.push(r.id as string);
          propias.push({
            asesoria_no: r.asesoria_no, fecha: r.fecha, nombres_apellidos: r.nombres_apellidos,
            cedula_numero: r.cedula_numero, area_derecho: r.area_derecho, direccion: r.direccion,
            contacto_1: r.contacto_1, correo: r.correo,
            estudiante_recepciona_nombre: r.estudiante_recepciona_nombre,
            naturaleza_asunto: r.naturaleza_asunto, pdf_url: r.pdf_url,
            fecha_asignacion: null, nombre_estudiante: null, codigo_estudiante: null,
          });
        });
        if ((data?.length ?? 0) < TAM) break;
      }

      // 2. Datos de asignación (estudiante, código, fecha del reparto) desde la vista, en bloques de 100 ids.
      //    Si la vista no se puede leer, igual se muestran las recepciones (solo sin la info de asignación).
      for (let i = 0; i < idPorFila.length; i += 100) {
        const bloque = idPorFila.slice(i, i + 100);
        const { data: asignaciones } = await supabase
          .from('libro_asesorias')
          .select('id_recepcion, fecha_asignacion, nombre_estudiante, codigo_estudiante')
          .in('id_recepcion', bloque);
        if (cancelado) return;
        (asignaciones ?? []).forEach((a: { id_recepcion: string; fecha_asignacion: string | null; nombre_estudiante: string | null; codigo_estudiante: string | null }) => {
          const pos = idPorFila.indexOf(a.id_recepcion);
          if (pos >= 0) {
            propias[pos].fecha_asignacion = a.fecha_asignacion;
            propias[pos].nombre_estudiante = a.nombre_estudiante;
            propias[pos].codigo_estudiante = a.codigo_estudiante;
          }
        });
      }

      // Más recientes primero. El N.º es texto: se compara como número cuando se puede.
      const orden = propias.map((r, i) => ({ r, i })).sort((x, y) => {
        const nx = Number(x.r.asesoria_no), ny = Number(y.r.asesoria_no);
        if (!Number.isNaN(nx) && !Number.isNaN(ny) && nx !== ny) return ny - nx;
        return (y.r.asesoria_no ?? '').localeCompare(x.r.asesoria_no ?? '');
      });
      setRegistros(orden.map((o) => o.r));
      setCargando(false);
    }

    verificarYCargar();
    return () => { cancelado = true; };
  }, [router]);

  // Agrupar por año -> periodo (los sin fecha válida quedan aparte)
  const grupos = new Map<number, Map<'I' | 'II', Registro[]>>();
  const sinFecha: Registro[] = [];

  for (const registro of registros) {
    const info = parsearFecha(registro.fecha);
    if (!info) { sinFecha.push(registro); continue; }
    if (!grupos.has(info.anio)) grupos.set(info.anio, new Map());
    const porPeriodo = grupos.get(info.anio)!;
    if (!porPeriodo.has(info.periodo)) porPeriodo.set(info.periodo, []);
    porPeriodo.get(info.periodo)!.push(registro);
  }

  const anios = [...grupos.keys()].sort((a, b) => b - a);

  async function exportarLibro() {
    if (registros.length === 0) return;
    setExportando(true);
    try {
      const libro = new ExcelJS.Workbook();
      libro.creator = 'Consultorio Jurídico';
      libro.created = new Date();

      const hoja = libro.addWorksheet('MIS RECEPCIONES', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      hoja.columns = COLUMNAS_EXPORTACION.map((c) => ({ width: c.ancho }));

      const filaTitulo = hoja.addRow(COLUMNAS_EXPORTACION.map((c) => c.encabezado));
      filaTitulo.eachCell((celda) => {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123524' } };
        celda.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
        celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        celda.border = {
          top: { style: 'thin', color: { argb: 'FF0D2A1C' } },
          bottom: { style: 'thin', color: { argb: 'FF0D2A1C' } },
          left: { style: 'thin', color: { argb: 'FF0D2A1C' } },
          right: { style: 'thin', color: { argb: 'FF0D2A1C' } },
        };
      });
      filaTitulo.height = 24;

      const filas: string[][] = [];
      for (const anio of anios) {
        const porPeriodo = grupos.get(anio)!;
        const periodos = (['II', 'I'] as const).filter((p) => porPeriodo.has(p));
        for (const periodo of periodos) {
          for (const r of porPeriodo.get(periodo)!) {
            filas.push(registroAFila(r));
          }
        }
      }
      for (const r of sinFecha) {
        filas.push(registroAFila(r));
      }

      filas.forEach((valores, indice) => {
        const fila = hoja.addRow(valores);
        const esPar = indice % 2 === 1;
        fila.eachCell((celda) => {
          celda.alignment = { vertical: 'middle', wrapText: true };
          celda.border = { bottom: { style: 'thin', color: { argb: 'FFE0E6E1' } } };
          if (esPar) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2EE' } };
        });
      });

      const buffer = await libro.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fechaArchivo = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `MIS_RECEPCIONES_${fechaArchivo}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  function tabla(lista: Registro[], grupoKey: string) {
    return (
      <div className="admin-table-card" key={grupoKey}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>N° asesoría</th>
              <th>Nombre del usuario</th>
              <th>Fecha</th>
              <th>Área</th>
              <th>Estudiante asignado</th>
              <th>PDF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, i) => {
              const id = `${grupoKey}-${r.asesoria_no ?? i}`;
              const abierto = expandidos.has(id);
              return (
                <Fragment key={id}>
                  <tr className={`fila-con-detalle${abierto ? ' fila-expandida' : ''}`}>
                    <td>{dato(r.asesoria_no)}</td>
                    <td>{dato(r.nombres_apellidos)}</td>
                    <td>{dato(r.fecha)}</td>
                    <td>{dato(r.area_derecho)}</td>
                    <td>{dato(r.nombre_estudiante)}</td>
                    <td>
                      {r.pdf_url ? (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="btn-expandir"
                          title="Descargar PDF de esta asesoría"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12" />
                            <polyline points="7 10 12 15 17 10" />
                            <path d="M4 19h16" />
                          </svg>
                        </a>
                      ) : (
                        <span className="sin-dato" title="No hay PDF guardado para esta asesoría">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn-expandir${abierto ? ' abierto' : ''}`}
                        onClick={() => alternarDetalle(id)}
                        title={abierto ? 'Ocultar detalle' : 'Ver detalle completo'}
                        aria-expanded={abierto}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="fila-detalle">
                      <td colSpan={7}>
                        <dl className="detalle-grid">
                          <div>
                            <dt>Número de documento</dt>
                            <dd>{dato(r.cedula_numero)}</dd>
                          </div>
                          <div>
                            <dt>Dirección</dt>
                            <dd>{dato(r.direccion)}</dd>
                          </div>
                          <div>
                            <dt>Teléfono</dt>
                            <dd>{dato(r.contacto_1)}</dd>
                          </div>
                          <div>
                            <dt>Correo</dt>
                            <dd>{dato(r.correo)}</dd>
                          </div>
                          <div>
                            <dt>Asunto</dt>
                            <dd>{dato(r.naturaleza_asunto)}</dd>
                          </div>
                          <div>
                            <dt>Fecha del reparto</dt>
                            <dd>{dato(r.fecha_asignacion)}</dd>
                          </div>
                          <div>
                            <dt>Código del estudiante</dt>
                            <dd>{dato(r.codigo_estudiante)}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="cp-wrap">
      <PanelTopbar
        title="Mis recepciones"
        subtitle="Historial de las asesorías que tú recepcionaste, organizado por año y periodo."
        action={
          <button
            type="button"
            className="cp-add-btn"
            onClick={exportarLibro}
            disabled={exportando || cargando || registros.length === 0}
            title="Descargar tu historial en Excel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <polyline points="7 10 12 15 17 10" />
              <path d="M4 19h16" />
            </svg>
            {exportando ? 'Exportando…' : 'Exportar'}
          </button>
        }
      />
      <div className="cp-content">

      {error && <div className="form-message error" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{error}</div>}
      {cargando && <p className="admin-estado-cargando">Cargando...</p>}
      {!cargando && registros.length === 0 && !error && (
        <p className="admin-estado-vacio">
          Todavía no has recepcionado ninguna asesoría. Si ya guardaste alguna y no aparece, avisa al administrador.
        </p>
      )}

      {anios.map((anio) => {
        const porPeriodo = grupos.get(anio)!;
        const periodos = (['II', 'I'] as const).filter((p) => porPeriodo.has(p));
        return (
          <div key={anio} className="libro-grupo-anio">
            <h3 className="libro-anio">{anio}</h3>
            {periodos.map((periodo) => (
              <div key={periodo} className="libro-periodo-bloque">
                <p className="libro-periodo-titulo">
                  Periodo {anio}-{periodo}
                </p>
                {tabla(porPeriodo.get(periodo)!, `${anio}-${periodo}`)}
              </div>
            ))}
          </div>
        );
      })}

      {sinFecha.length > 0 && (
        <div className="libro-grupo-anio">
          <h3 className="libro-anio">Sin fecha reconocible</h3>
          {tabla(sinFecha, 'sin-fecha')}
        </div>
      )}
      </div>
    </div>
  );
}