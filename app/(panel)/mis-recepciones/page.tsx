'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import ExcelJS from 'exceljs';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import { descargarArchivo, generarPdfRecepcion, valoresDesdeFila } from '@/lib/formatoRecepcion';
import { SeccionCaso, repartoDe, resumenCaso } from '@/lib/estructuraRecepcion';

type Registro = {
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

const CAMPOS_RECEPCION =
  'id, asesoria_no, fecha, nombres_apellidos, cedula_numero, area_derecho, direccion, contacto_1, correo, estudiante_recepciona_nombre, naturaleza_asunto, pdf_url';

type FilaRecepcion = {
  id: string; asesoria_no: string | null; fecha: string | null; nombres_apellidos: string | null;
  cedula_numero: string | null; area_derecho: string | null; direccion: string | null;
  contacto_1: string | null; correo: string | null; estudiante_recepciona_nombre: string | null;
  naturaleza_asunto: string | null; pdf_url: string | null;
};

function aRegistro(r: FilaRecepcion): Registro {
  return {
    id_recepcion: r.id, asesoria_no: r.asesoria_no, fecha: r.fecha, nombres_apellidos: r.nombres_apellidos,
    cedula_numero: r.cedula_numero, area_derecho: r.area_derecho, direccion: r.direccion,
    contacto_1: r.contacto_1, correo: r.correo,
    estudiante_recepciona_nombre: r.estudiante_recepciona_nombre,
    naturaleza_asunto: r.naturaleza_asunto, pdf_url: r.pdf_url,
    fecha_asignacion: null, nombre_estudiante: null, codigo_estudiante: null,
  };
}

// Datos de asignación (estudiante, código, fecha del reparto) desde la vista, en bloques de 100 ids.
// Si la vista no se puede leer, igual se muestran las recepciones (solo sin la info de asignación).
async function completarAsignacion(lista: Registro[]) {
  const ids = lista.map((r) => r.id_recepcion as string);
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from('libro_asesorias')
      .select('id_recepcion, fecha_asignacion, nombre_estudiante, codigo_estudiante')
      .in('id_recepcion', ids.slice(i, i + 100));
    (data ?? []).forEach((a: { id_recepcion: string; fecha_asignacion: string | null; nombre_estudiante: string | null; codigo_estudiante: string | null }) => {
      const r = lista.find((x) => x.id_recepcion === a.id_recepcion);
      if (r) {
        r.fecha_asignacion = a.fecha_asignacion;
        r.nombre_estudiante = a.nombre_estudiante;
        r.codigo_estudiante = a.codigo_estudiante;
      }
    });
  }
}

function mensajeDe(e: unknown, porDefecto: string) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return porDefecto;
}

// El periodo (año-I / año-II) va en su propia columna, igual que en el Libro de asesorías
function periodoDe(fecha: string | null) {
  const info = parsearFecha(fecha);
  return info ? `${info.anio}-${info.periodo}` : null;
}

export default function MisRecepcionesPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [monitorId, setMonitorId] = useState<string | null>(null);

  // Paginación: se pide a la base de datos solo la página actual (15 asesorías)
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal con toda la información de la asesoría (se abre al tocar una fila)
  const [detalle, setDetalle] = useState<Registro | null>(null);
  const [datosCaso, setDatosCaso] = useState<SeccionCaso[] | null>(null);
  const [reparto, setReparto] = useState<'Sí' | 'No' | null>(null);
  const [errorCaso, setErrorCaso] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  // Solo monitores entran aquí; el administrador tiene su propio Libro de Asesorías
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (perfil?.rol === 'administrador') { router.replace('/libro-asesorias'); return; }
      if (perfil?.rol !== 'monitor') { router.replace('/login'); return; }
      setMonitorId(user.id);
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // Carga solo la página actual
  useEffect(() => {
    if (!monitorId) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const desde = (pagina - 1) * POR_PAGINA;
      const { data, error: err, count } = await supabase
        .from('recepciones')
        .select(CAMPOS_RECEPCION, { count: 'exact' })
        .eq('monitor_id', monitorId)
        .order('asesoria_no', { ascending: false })
        .order('id')
        .range(desde, desde + POR_PAGINA - 1);
      if (cancelado) return;
      if (err) {
        if (err.code === 'PGRST103' && pagina > 1) setPagina(pagina - 1);
        else setError(err.message);
        setCargando(false);
        return;
      }
      const lista = ((data ?? []) as FilaRecepcion[]).map(aRegistro);
      await completarAsignacion(lista);
      if (cancelado) return;
      setRegistros(lista);
      setTotal(count ?? 0);
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [monitorId, pagina]);

  // Información completa de la asesoría: se pide solo cuando se abre el modal
  useEffect(() => {
    if (!detalle) return;
    let cancelado = false;
    async function cargarCaso(id: string | null) {
      setDatosCaso(null);
      setReparto(null);
      setErrorCaso(null);
      setErrorDescarga(null);
      if (!id) { setDatosCaso([]); return; }
      const { data, error: err } = await supabase.from('recepciones').select('*').eq('id', id).single();
      if (cancelado) return;
      if (err || !data) {
        setErrorCaso(err?.message ?? 'No se encontró la información del caso.');
        return;
      }
      setDatosCaso(resumenCaso(data));
      setReparto(repartoDe(data.detalles));
    }
    cargarCaso(detalle.id_recepcion);
    return () => { cancelado = true; };
  }, [detalle]);

  // Vuelve a llenar el formato PDF con los datos que hay hoy en la base de datos
  async function descargarFormato(r: Registro) {
    if (!r.id_recepcion) return;
    setGenerando(true);
    setErrorDescarga(null);
    try {
      const { data, error: err } = await supabase.from('recepciones').select('*').eq('id', r.id_recepcion).single();
      if (err) throw err;
      const bytes = await generarPdfRecepcion(valoresDesdeFila(data));
      descargarArchivo(bytes, `formato-recepcion-${r.asesoria_no ?? 'sin-numero'}.pdf`);
    } catch (e) {
      setErrorDescarga(mensajeDe(e, 'No se pudo generar el formato.'));
    } finally {
      setGenerando(false);
    }
  }

  // Para exportar se traen TODAS las recepciones del monitor (la tabla solo muestra una página)
  async function cargarTodas(): Promise<Registro[]> {
    const TAM = 1000;
    const todas: Registro[] = [];
    for (let desde = 0; ; desde += TAM) {
      const { data, error: err } = await supabase
        .from('recepciones')
        .select(CAMPOS_RECEPCION)
        .eq('monitor_id', monitorId)
        .order('id')
        .range(desde, desde + TAM - 1);
      if (err) throw err;
      todas.push(...((data ?? []) as FilaRecepcion[]).map(aRegistro));
      if ((data?.length ?? 0) < TAM) break;
    }
    await completarAsignacion(todas);
    // Más recientes primero. El N.º es texto: se compara como número cuando se puede.
    return todas.sort((x, y) => {
      const nx = Number(x.asesoria_no), ny = Number(y.asesoria_no);
      if (!Number.isNaN(nx) && !Number.isNaN(ny) && nx !== ny) return ny - nx;
      return (y.asesoria_no ?? '').localeCompare(x.asesoria_no ?? '');
    });
  }

  async function exportarLibro() {
    if (total === 0 || !monitorId) return;
    setExportando(true);
    try {
      const todas = await cargarTodas();

      // Agrupar por año -> periodo (los sin fecha válida quedan al final)
      const grupos = new Map<number, Map<'I' | 'II', Registro[]>>();
      const sinFecha: Registro[] = [];
      for (const registro of todas) {
        const info = parsearFecha(registro.fecha);
        if (!info) { sinFecha.push(registro); continue; }
        if (!grupos.has(info.anio)) grupos.set(info.anio, new Map());
        const porPeriodo = grupos.get(info.anio)!;
        if (!porPeriodo.has(info.periodo)) porPeriodo.set(info.periodo, []);
        porPeriodo.get(info.periodo)!.push(registro);
      }
      const anios = [...grupos.keys()].sort((a, b) => b - a);

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
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo exportar el historial.'));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="cp-wrap">
      <PanelTopbar
        title="Mis recepciones"
        subtitle="Historial de las asesorías que tú recepcionaste, con su año y periodo."
        action={
          <button
            type="button"
            className="cp-add-btn"
            onClick={exportarLibro}
            disabled={exportando || cargando || total === 0}
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

      {registros.length > 0 && (
        <div className="admin-table-card" style={{ opacity: cargando ? 0.6 : 1 }}>
          <table className="admin-table admin-table-compacta">
            <thead>
              <tr>
                <th>N° asesoría</th>
                <th>Periodo</th>
                <th>Nombre del usuario</th>
                <th>Fecha</th>
                <th>Área</th>
                <th>Estudiante asignado</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r, i) => (
                <tr
                  key={r.id_recepcion ?? `${r.asesoria_no ?? 'sin-numero'}-${i}`}
                  className="fila-clic"
                  tabIndex={0}
                  onClick={() => setDetalle(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setDetalle(r); }}
                >
                  <td>{dato(r.asesoria_no)}</td>
                  <td>{dato(periodoDe(r.fecha))}</td>
                  <td>{dato(r.nombres_apellidos)}</td>
                  <td>{dato(r.fecha)}</td>
                  <td>{dato(r.area_derecho)}</td>
                  <td>{dato(r.nombre_estudiante)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />
      </div>

      {/* Modal grande: toda la información de la asesoría */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal-card modal-card-grande" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <div className="caso-encabezado">
                <h3>Asesoría N° {detalle.asesoria_no || 'sin número'}</h3>
              </div>
              <div className="caso-resumen">
                <div><span>Usuario</span><strong>{detalle.nombres_apellidos || '—'}</strong></div>
                <div><span>Fecha</span><strong>{detalle.fecha || '—'}</strong></div>
                <div>
                  <span>Estudiante asignado</span>
                  <strong>
                    {detalle.nombre_estudiante
                      ? `${detalle.nombre_estudiante}${detalle.codigo_estudiante ? ` (${detalle.codigo_estudiante})` : ''}`
                      : 'Sin asignar'}
                  </strong>
                </div>
                <div><span>Fecha del reparto</span><strong>{detalle.fecha_asignacion || '—'}</strong></div>
                <div><span>Reparto</span><strong>{reparto ?? '—'}</strong></div>
              </div>

              {errorCaso ? (
                <div className="form-message error">{errorCaso}</div>
              ) : datosCaso === null ? (
                <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando información del caso...</p>
              ) : (
                datosCaso.map((sec, i) => (
                  <section key={sec.titulo} className="caso-seccion">
                    <h4 className="caso-seccion-titulo">{i + 1}. {sec.titulo}</h4>
                    <div className="caso-datos">
                      {sec.datos.map((d) => (
                        <div key={d.label} className={`caso-dato${d.largo ? ' largo' : ''}`}>
                          <span>{d.label}</span>
                          <p>{d.valor}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
              {errorDescarga && <div className="form-message error">{errorDescarga}</div>}
            </div>

            <div className="modal-acciones modal-acciones-compactas">
              <button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>
              {detalle.pdf_url && (
                <a
                  className="btn-secundario"
                  href={detalle.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  title="El PDF tal como se guardó cuando se hizo la recepción"
                >
                  Ver formato
                </a>
              )}
              <button
                className="btn-primary"
                onClick={() => descargarFormato(detalle)}
                disabled={!detalle.id_recepcion || generando}
                title="Vuelve a llenar el formato con los datos que hay hoy en el sistema"
              >
                {generando ? 'Generando...' : 'Descargar formato'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}