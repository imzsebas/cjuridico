'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermiso } from '@/lib/sesion';
import { abrirPdf, rutaDePdf } from '@/lib/pdfPrivado';
import { mensajeDe, traerTodo } from '@/lib/utilidades';
import { Filtros, Registro, SIN_FILTROS, aplicarFiltros, consultarOrdenado, descargarFormato, exportarExcel, hayFiltros } from '@/lib/asesorias';
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import Modal from '@/components/Modal';
import { BotonExportar, DetalleAsesoria, FiltrosAsesorias, TablaAsesorias, TituloAsesoria, useCaso } from '@/components/Asesorias';
import { FormProvider } from '@/components/recepcion/Controles';
import CamposSeccion from '@/components/recepcion/CamposFormulario';
import { Medidor, Valores, crearMedidor } from '@/lib/formatoRecepcion';
import { SECCIONES, hechoQueNoCabe, prepararEdicion, valoresParaEditar } from '@/lib/estructuraRecepcion';

// Frase que hay que ESCRIBIR (no se puede pegar) para eliminar una asesoría
const FRASE_ELIMINAR = 'ELIMINAR REGISTRO';

const mensajeArriba = { maxWidth: 1600, margin: '0 auto 16px' };

export default function LibroAsesoriasPage() {
  // Solo administradores
  const esAdmin = !!usePermiso(['administrador']);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  // Paginación: se pide a la base de datos solo la página actual (15 asesorías)
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);

  // Búsqueda y filtros: al cambiarlos se vuelve a la primera página
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const cambiarFiltros = useCallback((f: Filtros) => { setFiltros(f); setPagina(1); }, []);

  // Modal grande con toda la información de la asesoría (se abre al tocar una fila)
  const [detalle, setDetalle] = useState<Registro | null>(null);
  const [versionCaso, setVersionCaso] = useState(0);
  const caso = useCaso(detalle?.id_recepcion, versionCaso);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  // Eliminar asesoría: pide escribir la frase de confirmación
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

  useEffect(() => {
    if (!esAdmin) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const desde = (pagina - 1) * POR_PAGINA;
      const { data, error, count } = await consultarOrdenado<Registro>((columna) =>
        aplicarFiltros(supabase.from('libro_asesorias').select('*', { count: 'exact' }), filtros)
          .order(columna, { ascending: false })
          .order('id_recepcion')
          .range(desde, desde + POR_PAGINA - 1)
      );
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
  }, [esAdmin, pagina, recarga, filtros]);

  function abrirDetalle(r: Registro) {
    setErrorDescarga(null);
    setDetalle(r);
  }

  function cerrarDetalle() {
    setDetalle(null);
    setModoEdicion(false);
    setErrorEdicion(null);
    cerrarEliminar();
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

  // Pasa el modal a modo edición con todos los datos guardados de la asesoría
  function iniciarEdicion() {
    if (!caso.fila) return;
    setValoresEdicion(valoresParaEditar(caso.fila));
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
    if (!detalle?.id_recepcion || !esAdmin || fraseEscrita !== FRASE_ELIMINAR) return;
    setEliminando(true);
    setErrorEliminar(null);

    const numero = detalle.asesoria_no;
    const rutaPdf = rutaDePdf(detalle.pdf_url);
    const { data, error } = await supabase.from('recepciones').delete().eq('id', detalle.id_recepcion).select('id');
    if (error || !data || data.length === 0) {
      setEliminando(false);
      setErrorEliminar(
        error?.code === '23503'
          ? 'No se pudo eliminar porque hay información relacionada que no se borra sola (por ejemplo, la asignación). Hay que activar el borrado en cascada en Supabase.'
          : error
            ? error.message
            : 'No se eliminó nada: Supabase no te dio permiso para borrar (falta la política de eliminación para administradores).'
      );
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

  async function guardarEdicion() {
    if (!detalle?.id_recepcion) return;
    setErrorEdicion(null);

    if (!(valoresEdicion.nombres_apellidos ?? '').trim()) {
      setErrorEdicion('Falta el nombre del usuario (sección 1).');
      return;
    }
    const noCabe = await hechoQueNoCabe(valoresEdicion, medidor);
    if (noCabe) {
      setErrorEdicion(`El hecho ${noCabe} no cabe en el espacio del formato. Acórtalo para poder guardar.`);
      return;
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
    const { error } = await supabase.from('recepciones').update({ ...columnas, detalles }).eq('id', detalle.id_recepcion);
    setGuardandoEdicion(false);
    if (error) {
      setErrorEdicion(error.code === '23505' ? `Ya existe otra asesoría con el N.º ${numeroNuevo}.` : error.message);
      return;
    }
    setModoEdicion(false);
    setRecarga((n) => n + 1); // vuelve a pedir la lista
    setVersionCaso((n) => n + 1); // y la información completa del caso
    // El resumen de arriba se muestra ya con los datos nuevos
    const { fecha_asignacion, nombre_estudiante, codigo_estudiante } = detalle;
    setDetalle({ ...detalle, ...columnas, fecha_asignacion, nombre_estudiante, codigo_estudiante } as Registro);
  }

  async function exportarLibro() {
    if (total === 0 || !esAdmin) return;
    setExportando(true);
    setError(null);
    try {
      // Se traen TODAS las asesorías del libro (la tabla solo muestra una página)
      const todas = await traerTodo<Registro>((d, h) =>
        supabase.from('libro_asesorias').select('*').order('id_recepcion').range(d, h)
      );
      await exportarExcel(todas, 'LIBRO DE ASESORIAS', 'LIBRO_ASESORIAS');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo exportar el libro de asesorías.'));
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="cp-wrap">
      <PanelTopbar
        title="Libro de asesorías"
        subtitle="Historial completo de asesorías, con su año y periodo."
        action={
          <BotonExportar
            onClick={exportarLibro}
            deshabilitado={exportando || cargando || total === 0 || !esAdmin}
            exportando={exportando}
            title="Descargar el libro completo en Excel"
          />
        }
      />
      <div className="cp-content">
        {error && <div className="form-message error" style={mensajeArriba}>{error}</div>}
        {exito && <div className="form-message success" style={mensajeArriba}>{exito}</div>}
        <FiltrosAsesorias filtros={filtros} onCambiar={cambiarFiltros} total={total} cargando={cargando} />
        {cargando && registros.length === 0 && <p className="admin-estado-cargando">Cargando...</p>}
        {!cargando && registros.length === 0 && !error && (
          <p className="admin-estado-vacio">
            {hayFiltros(filtros) ? 'No se encontraron asesorías con ese criterio.' : 'Todavía no hay asesorías registradas.'}
          </p>
        )}
        <TablaAsesorias registros={registros} cargando={cargando} onAbrir={abrirDetalle} />
        <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />
      </div>

      {/* Modal grande: toda la información de la asesoría (o el formulario para editarla) */}
      {detalle && (
        <Modal
          clase="modal-card-grande"
          onFuera={() => { if (!modoEdicion) cerrarDetalle(); }}
          pie={errorEdicion && <div className="form-message error" style={{ margin: '0 24px 12px' }}>{errorEdicion}</div>}
          acciones={
            modoEdicion ? (
              <>
                <button className="btn-secundario" onClick={() => { setModoEdicion(false); setErrorEdicion(null); }} disabled={guardandoEdicion}>
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
                  <button
                    className="btn-secundario"
                    onClick={() => abrirPdf(detalle.pdf_url).catch((e) => setErrorDescarga(mensajeDe(e, 'No se pudo abrir el PDF.')))}
                    title="El PDF tal como se guardó cuando se hizo la recepción"
                  >
                    Ver formato
                  </button>
                )}
                <button className="btn-secundario" onClick={iniciarEdicion} disabled={!caso.fila || !detalle.id_recepcion}>
                  Editar
                </button>
                <button
                  className="btn-primary"
                  onClick={() => bajarFormato(detalle)}
                  disabled={!detalle.id_recepcion || generando}
                  title="Vuelve a llenar el formato con los datos que hay hoy en el sistema"
                >
                  {generando ? 'Generando...' : 'Descargar formato'}
                </button>
              </>
            )
          }
        >
          <TituloAsesoria>{modoEdicion ? 'Editar asesoría' : 'Asesoría'} N° {detalle.asesoria_no || 'sin número'}</TituloAsesoria>
          {modoEdicion ? (
            <FormProvider value={contextoEdicion}>
              <div className="rf">
                {SECCIONES.map((sec, i) => <CamposSeccion key={sec.titulo} paso={i} medidor={medidor} />)}
              </div>
            </FormProvider>
          ) : (
            <DetalleAsesoria registro={detalle} caso={caso} />
          )}
          {errorDescarga && <div className="form-message error">{errorDescarga}</div>}
        </Modal>
      )}

      {/* Confirmación para eliminar: hay que ESCRIBIR la frase (no se puede pegar) */}
      {confirmandoEliminar && detalle && (
        <Modal
          onFuera={cerrarEliminar}
          acciones={
            <>
              <button className="btn-secundario" onClick={cerrarEliminar} disabled={eliminando}>Cancelar</button>
              <button className="btn-peligro" onClick={eliminarRegistro} disabled={eliminando || fraseEscrita !== FRASE_ELIMINAR}>
                {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </>
          }
        >
          <h3>Eliminar registro</h3>
          <p className="texto-secundario" style={{ margin: '0 0 14px' }}>
            Asesoría N° {detalle.asesoria_no || 'sin número'} · {detalle.nombres_apellidos || 'sin nombre'}
          </p>
          <div className="field">
            <label htmlFor="frase-eliminar">
              Para confirmar, escribe <strong>{FRASE_ELIMINAR}</strong> (esta acción borrará todo lo relacionado a este registro: los datos de la
              asesoría, el estudiante asignado y el PDF guardado)
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
        </Modal>
      )}
    </div>
  );
}
