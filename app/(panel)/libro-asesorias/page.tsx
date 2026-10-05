'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import ExcelJS from 'exceljs';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import { FormProvider } from '@/components/recepcion/Controles';
import CamposSeccion from '@/components/recepcion/CamposFormulario';
import {
  Medidor, Valores, crearMedidor, descargarArchivo, generarPdfRecepcion, partirEnLineas, valoresDesdeFila,
} from '@/lib/formatoRecepcion';
import {
  HECHOS, SECCIONES, SeccionCaso, prepararEdicion, repartoDe, resumenCaso, valoresParaEditar,
} from '@/lib/estructuraRecepcion';

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

// Frase que hay que ESCRIBIR (no se puede pegar) para eliminar una asesoría
const FRASE_ELIMINAR = 'ELIMINAR REGISTRO';

const dato = (v: string | null) => v || <span className="sin-dato">—</span>;

function mensajeDe(e: unknown, porDefecto: string) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return porDefecto;
}

// Convierte a mayúsculas de forma segura (respeta null/undefined)
const mayus = (v: string | null | undefined) => (v ?? '').toString().toUpperCase();

// Mismos encabezados que el Excel de "Mis recepciones", con su ancho de columna
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

export default function LibroAsesoriasPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // Modal grande con toda la información de la asesoría (se abre al tocar una fila)
  const [detalle, setDetalle] = useState<Registro | null>(null);
  const [datosCaso, setDatosCaso] = useState<SeccionCaso[] | null>(null);
  const [reparto, setReparto] = useState<'Sí' | 'No' | null>(null);
  const [errorCaso, setErrorCaso] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [filaCaso, setFilaCaso] = useState<Record<string, unknown> | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [esAdmin, setEsAdmin] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  // Eliminar asesoría (solo administrador): pide escribir la frase de confirmación
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [fraseEscrita, setFraseEscrita] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // Edición de TODOS los datos de la asesoría, en el mismo modal grande
  const [modoEdicion, setModoEdicion] = useState(false);
  const [valoresEdicion, setValoresEdicion] = useState<Valores>({});
  const [medidor, setMedidor] = useState<Medidor | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const setCampo = useCallback((k: string, v: string) => setValoresEdicion((p) => ({ ...p, [k]: v })), []);
  const setCampos = useCallback((c: Valores) => setValoresEdicion((p) => ({ ...p, ...c })), []);
  const contextoEdicion = useMemo(
    () => ({ valores: valoresEdicion, set: setCampo, setVarios: setCampos }),
    [valoresEdicion, setCampo, setCampos]
  );

  // Paginación: se pide a la base de datos solo la página actual (15 asesorías)
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);

  // Solo administradores
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (perfil?.rol !== 'administrador') { router.replace('/login'); return; }
      setEsAdmin(true);
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const desde = (pagina - 1) * POR_PAGINA;
      const { data, error, count } = await supabase
        .from('libro_asesorias')
        .select('*', { count: 'exact' })
        .order('asesoria_no', { ascending: false })
        .order('id_recepcion')
        .range(desde, desde + POR_PAGINA - 1);
      if (cancelado) return;
      if (error) {
        // Si la página quedó vacía (p. ej. al eliminar el último registro de la última página), retrocede una
        if (error.code === 'PGRST103' && pagina > 1) setPagina(pagina - 1);
        else setError(error.message);
      } else {
        setRegistros(data ?? []);
        setTotal(count ?? 0);
      }
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [pagina, recarga]);

  // Información completa de la asesoría: se pide solo cuando se abre el modal
  useEffect(() => {
    if (!detalle) return;
    let cancelado = false;
    async function cargarCaso(id: string | null) {
      setDatosCaso(null);
      setFilaCaso(null);
      setReparto(null);
      setErrorCaso(null);
      setErrorDescarga(null);
      if (!id) {
        setDatosCaso([]);
        return;
      }
      const { data, error } = await supabase.from('recepciones').select('*').eq('id', id).single();
      if (cancelado) return;
      if (error || !data) {
        setErrorCaso(error?.message ?? 'No se encontró la información del caso.');
        return;
      }
      setDatosCaso(resumenCaso(data));
      setFilaCaso(data);
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
      const { data, error } = await supabase.from('recepciones').select('*').eq('id', r.id_recepcion).single();
      if (error) throw error;
      const bytes = await generarPdfRecepcion(valoresDesdeFila(data));
      descargarArchivo(bytes, `formato-recepcion-${r.asesoria_no ?? 'sin-numero'}.pdf`);
    } catch (e) {
      setErrorDescarga(mensajeDe(e, 'No se pudo generar el formato.'));
    } finally {
      setGenerando(false);
    }
  }

  function cerrarDetalle() {
    setDetalle(null);
    setModoEdicion(false);
    setErrorEdicion(null);
    cerrarEliminar();
  }

  // Pasa el modal a modo edición con todos los datos guardados de la asesoría
  function iniciarEdicion() {
    if (!filaCaso) return;
    setValoresEdicion(valoresParaEditar(filaCaso));
    setErrorEdicion(null);
    setModoEdicion(true);
    if (!medidor) crearMedidor().then((m) => setMedidor(() => m));
    document.querySelector('.modal-card-grande .modal-card-cuerpo')?.scrollTo({ top: 0 });
  }

  function abrirEliminar() {
    setFraseEscrita('');
    setErrorEliminar(null);
    setConfirmandoEliminar(true);
  }

  function cerrarEliminar() {
    if (eliminando) return;
    setConfirmandoEliminar(false);
    setFraseEscrita('');
    setErrorEliminar(null);
  }

  // Elimina la asesoría y, con ella, lo relacionado (la asignación se borra en cascada en la base de datos)
  async function eliminarRegistro() {
    if (!detalle?.id_recepcion || !esAdmin) return;
    if (fraseEscrita !== FRASE_ELIMINAR) return;
    setEliminando(true);
    setErrorEliminar(null);

    const id = detalle.id_recepcion;
    const numero = detalle.asesoria_no;
    const rutaPdf = detalle.pdf_url ? decodeURIComponent(detalle.pdf_url.split('/recepciones/').pop() ?? '') : '';

    const { data, error } = await supabase.from('recepciones').delete().eq('id', id).select('id');
    if (error) {
      setEliminando(false);
      setErrorEliminar(
        error.code === '23503'
          ? 'No se pudo eliminar porque hay información relacionada que no se borra sola (por ejemplo, la asignación). Hay que activar el borrado en cascada en Supabase.'
          : error.message
      );
      return;
    }
    if (!data || data.length === 0) {
      setEliminando(false);
      setErrorEliminar('No se eliminó nada: Supabase no te dio permiso para borrar (falta la política de eliminación para administradores).');
      return;
    }

    // El registro ya no existe: se borra también el PDF guardado (si falla, no importa para el usuario)
    if (rutaPdf) await supabase.storage.from('recepciones').remove([rutaPdf]);

    setEliminando(false);
    setConfirmandoEliminar(false);
    setFraseEscrita('');
    setDetalle(null);
    setModoEdicion(false);
    setExito(`La asesoría ${numero ? `N.º ${numero} ` : ''}se eliminó junto con todo lo relacionado.`);
    setRecarga((n) => n + 1);
  }

  function cancelarEdicion() {
    setModoEdicion(false);
    setErrorEdicion(null);
  }

  async function guardarEdicion() {
    if (!detalle?.id_recepcion) return;
    setErrorEdicion(null);

    if (!(valoresEdicion.nombres_apellidos ?? '').trim()) {
      setErrorEdicion('Falta el nombre del usuario (sección 1).');
      return;
    }
    const medir = medidor ?? (await crearMedidor());
    for (const n of HECHOS) {
      const texto = (valoresEdicion[`sintesis_hecho_${n}`] ?? '').toUpperCase();
      if (partirEnLineas(texto, medir).desborde) {
        setErrorEdicion(`El hecho ${n} no cabe en el espacio del formato. Acórtalo para poder guardar.`);
        return;
      }
    }

    setGuardandoEdicion(true);

    // El N.º de asesoría es opcional; si se escribe, que no se repita en otra asesoría
    const numeroNuevo = (valoresEdicion.asesoria_no ?? '').trim();
    if (numeroNuevo) {
      const { data: repetida, error: errorRepetida } = await supabase
        .from('recepciones')
        .select('id')
        .eq('asesoria_no', numeroNuevo)
        .neq('id', detalle.id_recepcion)
        .limit(1);
      if (errorRepetida || (repetida && repetida.length > 0)) {
        setGuardandoEdicion(false);
        setErrorEdicion(errorRepetida ? errorRepetida.message : `Ya existe otra asesoría con el N.º ${numeroNuevo}.`);
        return;
      }
    }

    const { columnas, detalles } = prepararEdicion(valoresEdicion);
    const { error } = await supabase
      .from('recepciones')
      .update({ ...columnas, detalles })
      .eq('id', detalle.id_recepcion);
    setGuardandoEdicion(false);

    if (error) {
      setErrorEdicion(error.message);
      return;
    }
    setModoEdicion(false);
    setRecarga((n) => n + 1); // vuelve a pedir la lista
    // Se vuelve a mostrar la asesoría ya con los datos nuevos
    setDetalle({
      ...detalle,
      asesoria_no: columnas.asesoria_no,
      nombres_apellidos: columnas.nombres_apellidos,
      fecha: columnas.fecha,
      cedula_numero: columnas.cedula_numero,
      area_derecho: columnas.area_derecho,
      direccion: columnas.direccion,
      contacto_1: columnas.contacto_1,
      correo: columnas.correo,
      estudiante_recepciona_nombre: columnas.estudiante_recepciona_nombre,
      naturaleza_asunto: columnas.naturaleza_asunto,
    });
  }

  // Para exportar se traen TODAS las asesorías del libro (la tabla solo muestra una página)
  async function cargarTodas(): Promise<Registro[]> {
    const TAM = 1000;
    const todas: Registro[] = [];
    for (let desde = 0; ; desde += TAM) {
      const { data, error: err } = await supabase
        .from('libro_asesorias')
        .select('*')
        .order('id_recepcion')
        .range(desde, desde + TAM - 1);
      if (err) throw err;
      todas.push(...((data ?? []) as Registro[]));
      if ((data?.length ?? 0) < TAM) break;
    }
    // Más recientes primero. El N.º es texto: se compara como número cuando se puede.
    return todas.sort((x, y) => {
      const nx = Number(x.asesoria_no), ny = Number(y.asesoria_no);
      if (!Number.isNaN(nx) && !Number.isNaN(ny) && nx !== ny) return ny - nx;
      return (y.asesoria_no ?? '').localeCompare(x.asesoria_no ?? '');
    });
  }

  async function exportarLibro() {
    if (total === 0 || !esAdmin) return;
    setExportando(true);
    setError(null);
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

      const hoja = libro.addWorksheet('LIBRO DE ASESORIAS', {
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
      enlace.download = `LIBRO_ASESORIAS_${fechaArchivo}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo exportar el libro de asesorías.'));
    } finally {
      setExportando(false);
    }
  }

  // La tabla muestra la página actual en orden, con el periodo (año-I / año-II) en su propia columna.
  // Así los encabezados no se parten ni se repiten al cambiar de página.
  function periodoDe(fecha: string | null) {
    const info = parsearFecha(fecha);
    return info ? `${info.anio}-${info.periodo}` : null;
  }

  return (
    <div className="cp-wrap">
      <PanelTopbar
        title="Libro de asesorías"
        subtitle="Historial completo de asesorías, con su año y periodo."
        action={
          <button
            type="button"
            className="cp-add-btn"
            onClick={exportarLibro}
            disabled={exportando || cargando || total === 0 || !esAdmin}
            title="Descargar el libro completo en Excel"
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
      {exito && <div className="form-message success" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{exito}</div>}
      {cargando && <p className="admin-estado-cargando">Cargando...</p>}
      {!cargando && registros.length === 0 && !error && (
        <p className="admin-estado-vacio">Todavía no hay asesorías registradas.</p>
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
        <div className="modal-overlay" onClick={() => { if (!modoEdicion) cerrarDetalle(); }}>
          <div className="modal-card modal-card-grande" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <div className="caso-encabezado">
                <h3>{modoEdicion ? 'Editar asesoría' : 'Asesoría'} N° {detalle.asesoria_no || 'sin número'}</h3>
              </div>
              {modoEdicion ? (
                <FormProvider value={contextoEdicion}>
                  <div className="rf">
                    {SECCIONES.map((sec, i) => (
                      <CamposSeccion key={sec.titulo} paso={i} medidor={medidor} />
                    ))}
                  </div>
                </FormProvider>
              ) : (
                <>
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
                </>
              )}
              {errorDescarga && <div className="form-message error">{errorDescarga}</div>}
            </div>

            {errorEdicion && (
              <div className="form-message error" style={{ margin: '0 24px 12px' }}>{errorEdicion}</div>
            )}

            <div className="modal-acciones modal-acciones-compactas">
              {modoEdicion ? (
                <>
                  <button className="btn-secundario" onClick={cancelarEdicion} disabled={guardandoEdicion}>
                    Cancelar
                  </button>
                  <button className="btn-primary" onClick={guardarEdicion} disabled={guardandoEdicion}>
                    {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </>
              ) : (
                <>
                  {esAdmin && detalle.id_recepcion && (
                    <button className="btn-secundario btn-eliminar acciones-izquierda" onClick={abrirEliminar}>
                      Eliminar
                    </button>
                  )}
                  <button className="btn-secundario" onClick={cerrarDetalle}>Cerrar</button>
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
                    className="btn-secundario"
                    onClick={iniciarEdicion}
                    disabled={!filaCaso || !detalle.id_recepcion}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => descargarFormato(detalle)}
                    disabled={!detalle.id_recepcion || generando}
                    title="Vuelve a llenar el formato con los datos que hay hoy en el sistema"
                  >
                    {generando ? 'Generando...' : 'Descargar formato'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmación para eliminar: hay que ESCRIBIR la frase (no se puede pegar) */}
      {confirmandoEliminar && detalle && (
        <div className="modal-overlay" onClick={cerrarEliminar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <h3>Eliminar registro</h3>
              <div className="aviso-peligro">
                <strong>Advertencia:</strong> esta acción borrará todo lo relacionado a este registro (los datos de la
                asesoría, el estudiante asignado y el PDF guardado). No se puede deshacer.
              </div>
              <p className="texto-secundario" style={{ margin: '0 0 14px' }}>
                Asesoría N° {detalle.asesoria_no || 'sin número'} · {detalle.nombres_apellidos || 'sin nombre'}
              </p>
              <div className="field">
                <label htmlFor="frase-eliminar">
                  Para confirmar, escribe <strong>{FRASE_ELIMINAR}</strong> (no se puede copiar ni pegar)
                </label>
                <input
                  id="frase-eliminar"
                  type="text"
                  value={fraseEscrita}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={eliminando}
                  placeholder={FRASE_ELIMINAR}
                  onChange={(e) => setFraseEscrita(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  onBeforeInput={(e) => {
                    const tipo = (e.nativeEvent as InputEvent).inputType;
                    if (tipo === 'insertFromPaste' || tipo === 'insertFromDrop' || tipo === 'insertFromYank') e.preventDefault();
                  }}
                />
              </div>
              {errorEliminar && <div className="form-message error" style={{ marginTop: 12 }}>{errorEliminar}</div>}
            </div>
            <div className="modal-acciones modal-acciones-compactas">
              <button className="btn-secundario" onClick={cerrarEliminar} disabled={eliminando}>Cancelar</button>
              <button
                className="btn-peligro"
                onClick={eliminarRegistro}
                disabled={eliminando || fraseEscrita !== FRASE_ELIMINAR}
              >
                {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}