'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermiso } from '@/lib/sesion';
import { abrirPdf } from '@/lib/pdfPrivado';
import { mensajeDe, traerTodo } from '@/lib/utilidades';
import { Filtros, Registro, SIN_FILTROS, aplicarFiltros, consultarOrdenado, descargarFormato, exportarExcel, hayFiltros } from '@/lib/asesorias';
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import Modal from '@/components/Modal';
import { BotonExportar, DetalleAsesoria, FiltrosAsesorias, TablaAsesorias, TituloAsesoria, useCaso } from '@/components/Asesorias';

const CAMPOS_RECEPCION =
  'id, asesoria_no, fecha, nombres_apellidos, cedula_numero, area_derecho, direccion, contacto_1, correo, estudiante_recepciona_nombre, naturaleza_asunto, pdf_url';

type FilaRecepcion = Omit<Registro, 'id_recepcion' | 'fecha_asignacion' | 'nombre_estudiante' | 'codigo_estudiante'> & { id: string };
type DatosAsignacion = Pick<Registro, 'id_recepcion' | 'fecha_asignacion' | 'nombre_estudiante' | 'codigo_estudiante'>;

// Convierte las filas de "recepciones" en registros y les agrega los datos de asignación (estudiante, código,
// fecha del reparto) desde la vista, en bloques de 100. Si la vista no se puede leer, igual se muestran.
async function aRegistros(filas: FilaRecepcion[]): Promise<Registro[]> {
  const lista: Registro[] = filas.map(({ id, ...r }) => ({
    ...r, id_recepcion: id, fecha_asignacion: null, nombre_estudiante: null, codigo_estudiante: null,
  }));
  const porId = new Map(lista.map((r) => [r.id_recepcion, r]));
  const ids = [...porId.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from('libro_asesorias')
      .select('id_recepcion, fecha_asignacion, nombre_estudiante, codigo_estudiante')
      .in('id_recepcion', ids.slice(i, i + 100));
    ((data ?? []) as DatosAsignacion[]).forEach((a) => {
      const r = porId.get(a.id_recepcion);
      if (r) Object.assign(r, { fecha_asignacion: a.fecha_asignacion, nombre_estudiante: a.nombre_estudiante, codigo_estudiante: a.codigo_estudiante });
    });
  }
  return lista;
}

export default function MisRecepcionesPage() {
  // Solo monitores entran aquí; el administrador tiene su propio Libro de Asesorías
  const sesion = usePermiso(['monitor'], (rol) => (rol === 'administrador' ? '/libro-asesorias' : '/login'));
  const monitorId = sesion?.userId ?? null;
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // Paginación: se pide a la base de datos solo la página actual (15 asesorías)
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);

  // Búsqueda y filtros: al cambiarlos se vuelve a la primera página
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const cambiarFiltros = useCallback((f: Filtros) => { setFiltros(f); setPagina(1); }, []);

  // Modal con toda la información de la asesoría (se abre al tocar una fila)
  const [detalle, setDetalle] = useState<Registro | null>(null);
  const caso = useCaso(detalle?.id_recepcion);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  // Carga solo la página actual
  useEffect(() => {
    if (!monitorId) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const desde = (pagina - 1) * POR_PAGINA;
      const { data, error: err, count } = await consultarOrdenado<FilaRecepcion>((columna) =>
        aplicarFiltros(supabase.from('recepciones').select(CAMPOS_RECEPCION, { count: 'exact' }).eq('monitor_id', monitorId), filtros)
          .order(columna, { ascending: false })
          .order('id')
          .range(desde, desde + POR_PAGINA - 1)
      );
      if (cancelado) return;
      if (err) {
        if (err.code === 'PGRST103' && pagina > 1) setPagina(pagina - 1);
        else setError(err.message);
        setCargando(false);
        return;
      }
      const lista = await aRegistros(data ?? []);
      if (cancelado) return;
      setRegistros(lista);
      setTotal(count ?? 0);
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [monitorId, pagina, filtros]);

  function abrirDetalle(r: Registro) {
    setErrorDescarga(null);
    setDetalle(r);
  }

  async function bajarFormato(r: Registro) {
    setGenerando(true);
    setErrorDescarga(null);
    try {
      await descargarFormato(r);
    } catch (e) {
      setErrorDescarga(mensajeDe(e, 'No se pudo generar el formato.'));
    } finally {
      setGenerando(false);
    }
  }

  async function exportarHistorial() {
    if (total === 0 || !monitorId) return;
    setExportando(true);
    try {
      // Se traen TODAS las recepciones del monitor (la tabla solo muestra una página)
      const filas = await traerTodo<FilaRecepcion>((d, h) =>
        supabase.from('recepciones').select(CAMPOS_RECEPCION).eq('monitor_id', monitorId).order('id').range(d, h)
      );
      await exportarExcel(await aRegistros(filas), 'MIS RECEPCIONES', 'MIS_RECEPCIONES');
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
          <BotonExportar
            onClick={exportarHistorial}
            deshabilitado={exportando || cargando || total === 0}
            exportando={exportando}
            title="Descargar tu historial en Excel"
          />
        }
      />
      <div className="cp-content">
        {error && <div className="form-message error" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{error}</div>}
        <FiltrosAsesorias filtros={filtros} onCambiar={cambiarFiltros} total={total} cargando={cargando} />
        {cargando && registros.length === 0 && <p className="admin-estado-cargando">Cargando...</p>}
        {!cargando && registros.length === 0 && !error && (
          <p className="admin-estado-vacio">
            {hayFiltros(filtros)
              ? 'No se encontraron asesorías con ese criterio.'
              : 'Todavía no has recepcionado ninguna asesoría. Si ya guardaste alguna y no aparece, avisa al administrador.'}
          </p>
        )}
        <TablaAsesorias registros={registros} cargando={cargando} onAbrir={abrirDetalle} />
        <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />
      </div>

      {/* Modal grande: toda la información de la asesoría */}
      {detalle && (
        <Modal
          clase="modal-card-grande"
          onFuera={() => setDetalle(null)}
          acciones={
            <>
              <button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>
              {detalle.pdf_url && (
                <button
                  className="btn-secundario"
                  onClick={() => abrirPdf(detalle.pdf_url).catch((e) => setErrorDescarga(mensajeDe(e, 'No se pudo abrir el PDF.')))}
                  title="El PDF tal como se guardó cuando se hizo la recepción"
                >
                  Ver formato
                </button>
              )}
              <button
                className="btn-primary"
                onClick={() => bajarFormato(detalle)}
                disabled={!detalle.id_recepcion || generando}
                title="Vuelve a llenar el formato con los datos que hay hoy en el sistema"
              >
                {generando ? 'Generando...' : 'Descargar formato'}
              </button>
            </>
          }
        >
          <TituloAsesoria>Asesoría N° {detalle.asesoria_no || 'sin número'}</TituloAsesoria>
          <DetalleAsesoria registro={detalle} caso={caso} />
          {errorDescarga && <div className="form-message error">{errorDescarga}</div>}
        </Modal>
      )}
    </div>
  );
}
