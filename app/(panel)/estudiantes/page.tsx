'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermiso } from '@/lib/sesion';
import { difNumerica, uno } from '@/lib/utilidades';
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import Modal from '@/components/Modal';
import { Campo, CampoNivel } from '@/components/Campo';
import { NIVELES, nivelRomano, etiquetaNivel } from '@/lib/niveles';
import { DIAS, TURNOS, nombreDia } from '@/lib/turnos';

type Estudiante = {
  id: string;
  nombre_estudiante: string;
  codigo_estudiante: string;
  telefono_estudiante: string | null;
  correo_estudiante: string | null;
  nivel_consultorio: string;
};

type CasoAsignado = { asesoria_no: string | null; nombres_apellidos: string | null; area_derecho: string | null };

const VACIO = {
  nombre_estudiante: '', codigo_estudiante: '', telefono_estudiante: '',
  correo_estudiante: '', nivel_consultorio: NIVELES[0] as string,
};
type Datos = typeof VACIO;

// Campos de texto del modal Nuevo / Editar estudiante
const CAMPOS: [campo: keyof Datos, label: string, tipo?: 'email'][] = [
  ['nombre_estudiante', 'Nombre'],
  ['codigo_estudiante', 'Código'],
  ['telefono_estudiante', 'Teléfono'],
  ['correo_estudiante', 'Correo', 'email'],
];

const sinDato = <span className="sin-dato">—</span>;

// Horario del estudiante: claves "dia-turno" (p. ej. "2-3" = martes, turno 3)
const aPar = (clave: string) => {
  const [dia, turno] = clave.split('-').map(Number);
  return { dia, turno };
};

export default function EstudiantesPage() {
  const autorizado = !!usePermiso(['administrador']);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal Nuevo / Editar
  const [modal, setModal] = useState<{ id: string | null; datos: Datos } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Modal con toda la información del estudiante (se abre al tocar una fila).
  // Sus asesorías y su horario se guardan junto con el id del estudiante al que pertenecen:
  // así, al abrir otro estudiante, no se ven por un instante los datos del anterior.
  const [detalle, setDetalle] = useState<Estudiante | null>(null);
  const [casos, setCasos] = useState<{ id: string; lista: CasoAsignado[] | null; error: string | null } | null>(null);
  const [horario, setHorario] = useState<{ id: string; turnos: Set<string> } | null>(null);
  const [diaSel, setDiaSel] = useState('');
  const [turnoSel, setTurnoSel] = useState('');
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [errorHorario, setErrorHorario] = useState<string | null>(null);
  const idDetalle = detalle?.id ?? null;
  const casosActuales = casos?.id === idDetalle ? casos : null;
  const turnosActuales = horario?.id === idDetalle ? horario.turnos : null;

  // Confirmación para eliminar un estudiante
  const [eliminando, setEliminando] = useState<Estudiante | null>(null);
  const [trabajandoEliminar, setTrabajandoEliminar] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // --- Búsqueda, filtro y paginación: se pide a la base de datos solo la página actual (15 registros) ---
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<string>('TODOS');
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [recarga, setRecarga] = useState(0);

  // La búsqueda espera un instante después de escribir, para no consultar en cada tecla
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusquedaAplicada(busqueda.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [busqueda]);

  useEffect(() => {
    if (!autorizado) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const desde = (pagina - 1) * POR_PAGINA;
      let consulta = supabase.from('estudiantes').select('*', { count: 'exact' });
      if (busquedaAplicada) {
        consulta = consulta.ilike('nombre_estudiante', `%${busquedaAplicada.replace(/[\\%_]/g, '\\$&')}%`);
      }
      if (filtroNivel !== 'TODOS') consulta = consulta.eq('nivel_consultorio', filtroNivel);
      const { data, error, count } = await consulta
        .order('nombre_estudiante')
        .order('id')
        .range(desde, desde + POR_PAGINA - 1);
      if (cancelado) return;
      if (error) {
        // Si la página quedó vacía (p. ej. al eliminar el último registro de la última página), retrocede una
        if (error.code === 'PGRST103' && pagina > 1) setPagina(pagina - 1);
        else setError(error.message);
      } else {
        setEstudiantes(data ?? []);
        setTotal(count ?? 0);
      }
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [autorizado, pagina, busquedaAplicada, filtroNivel, recarga]);

  // Asesorías activas del estudiante y su horario: se piden solo cuando se abre el modal
  useEffect(() => {
    if (!idDetalle) return;
    let cancelado = false;
    supabase
      .from('asignaciones')
      .select('recepciones ( asesoria_no, nombres_apellidos, area_derecho )')
      .eq('id_estudiante', idDetalle)
      .eq('activa', true)
      .then(({ data, error }) => {
        if (cancelado) return;
        const lista = (data ?? [])
          .map((a) => uno(a.recepciones as CasoAsignado | CasoAsignado[] | null))
          .filter((c): c is CasoAsignado => !!c)
          .sort((x, y) => difNumerica(y.asesoria_no, x.asesoria_no) || (y.asesoria_no ?? '').localeCompare(x.asesoria_no ?? ''));
        setCasos({ id: idDetalle, lista: error ? null : lista, error: error?.message ?? null });
      });
    supabase
      .from('horarios_estudiantes')
      .select('dia, turno')
      .eq('id_estudiante', idDetalle)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) { setErrorHorario(error.message); return; }
        setHorario({ id: idDetalle, turnos: new Set((data ?? []).map((h) => `${h.dia}-${h.turno}`)) });
      });
    return () => { cancelado = true; };
  }, [idDetalle]);

  // Turnos asignados, ordenados por día y turno
  const asignados = turnosActuales
    ? [...turnosActuales].map((k) => ({ clave: k, ...aPar(k) })).sort((a, b) => a.dia - b.dia || a.turno - b.turno)
    : [];

  function abrirDetalle(e: Estudiante) {
    setErrorHorario(null);
    setDiaSel('');
    setTurnoSel('');
    setDetalle(e);
  }

  async function cambiarHorario(clave: string, agregar: boolean) {
    if (!detalle || !turnosActuales) return;
    if (agregar && turnosActuales.has(clave)) { setErrorHorario('Ese turno ya está asignado.'); return; }
    const { dia, turno } = aPar(clave);
    setGuardandoHorario(true);
    setErrorHorario(null);
    const tabla = supabase.from('horarios_estudiantes');
    const { error } = agregar
      ? await tabla.insert({ id_estudiante: detalle.id, dia, turno })
      : await tabla.delete().eq('id_estudiante', detalle.id).eq('dia', dia).eq('turno', turno);
    setGuardandoHorario(false);
    if (error) { setErrorHorario(error.message); return; }
    const copia = new Set(turnosActuales);
    if (agregar) copia.add(clave); else copia.delete(clave);
    setHorario({ id: detalle.id, turnos: copia });
  }

  function abrirModal(id: string | null, datos: Datos) {
    setDetalle(null);
    setErrorModal(null);
    setModal({ id, datos });
  }

  async function guardar() {
    if (!modal) return;
    setGuardando(true);
    setErrorModal(null);
    const { id, datos } = modal;
    const { error } = id
      ? await supabase.from('estudiantes').update(datos).eq('id', id)
      : await supabase.from('estudiantes').insert(datos);
    setGuardando(false);
    if (error) { setErrorModal(error.message); return; }
    setModal(null);
    setRecarga((n) => n + 1);
  }

  async function eliminar() {
    if (!eliminando) return;
    setTrabajandoEliminar(true);
    setErrorEliminar(null);
    const { error } = await supabase.from('estudiantes').delete().eq('id', eliminando.id);
    setTrabajandoEliminar(false);
    if (error) {
      setErrorEliminar(error.code === '23503'
        ? 'No se puede eliminar: el estudiante tiene asesorías asignadas (activas o en el historial).'
        : error.message);
      return;
    }
    setEliminando(null);
    setRecarga((n) => n + 1);
  }

  return (
    <>
    <div className="cp-wrap">
      <PanelTopbar
        title="Estudiantes"
        subtitle={`${total} estudiantes · Directorio del consultorio`}
        action={
          <button className="cp-add-btn" onClick={() => abrirModal(null, { ...VACIO })}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            Nuevo estudiante
          </button>
        }
      />
      <div className="cp-content">
      {error && <div className="form-message error" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{error}</div>}

      <div className="admin-toolbar">
        <input
          type="text"
          className="admin-input-busqueda"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="admin-select-filtro"
          value={filtroNivel}
          onChange={(e) => { setFiltroNivel(e.target.value); setPagina(1); }}
        >
          <option value="TODOS">Todos los niveles</option>
          {NIVELES.map((n) => <option key={n} value={n}>{etiquetaNivel(n)}</option>)}
        </select>
        {!cargando && (
          <span className="admin-contador">
            {total} {total === 1 ? 'estudiante' : 'estudiantes'}
          </span>
        )}
      </div>

      {cargando && estudiantes.length === 0 && <p className="admin-estado-cargando">Cargando...</p>}
      {!cargando && total === 0 && (
        <p className="admin-estado-vacio">
          {busquedaAplicada || filtroNivel !== 'TODOS'
            ? 'No se encontraron estudiantes con ese criterio.'
            : 'Todavía no hay estudiantes registrados.'}
        </p>
      )}

      {total > 0 && estudiantes.length > 0 && (
        <div className="admin-table-card" style={{ opacity: cargando ? 0.6 : 1 }}>
          <table className="admin-table admin-table-compacta">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Nivel de consultorio</th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((e) => (
                <tr
                  key={e.id}
                  className="fila-clic"
                  tabIndex={0}
                  onClick={() => abrirDetalle(e)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') abrirDetalle(e); }}
                >
                  <td>{e.nombre_estudiante}</td>
                  <td>{e.codigo_estudiante}</td>
                  <td>{e.telefono_estudiante || sinDato}</td>
                  <td>{e.correo_estudiante || sinDato}</td>
                  <td>{nivelRomano(e.nivel_consultorio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />
      </div>
    </div>

    {/* Modal: información completa del estudiante (aquí están Editar y Eliminar) */}
    {detalle && (
      <Modal
        clase="modal-card-ancho"
        onFuera={() => setDetalle(null)}
        acciones={
          <>
            <button className="btn-secundario btn-eliminar acciones-izquierda" onClick={() => { setErrorEliminar(null); setEliminando(detalle); setDetalle(null); }}>Eliminar</button>
            <button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>
            <button
              className="btn-primary"
              onClick={() => abrirModal(detalle.id, {
                nombre_estudiante: detalle.nombre_estudiante,
                codigo_estudiante: detalle.codigo_estudiante,
                telefono_estudiante: detalle.telefono_estudiante ?? '',
                correo_estudiante: detalle.correo_estudiante ?? '',
                nivel_consultorio: detalle.nivel_consultorio,
              })}
            >
              Editar
            </button>
          </>
        }
      >
        <div className="caso-encabezado">
          <h3>{detalle.nombre_estudiante}</h3>
        </div>

        <div className="caso-datos" style={{ marginBottom: 18 }}>
          <div className="caso-dato"><span>Código</span><p>{detalle.codigo_estudiante || '—'}</p></div>
          <div className="caso-dato"><span>Nivel de consultorio</span><p>{nivelRomano(detalle.nivel_consultorio) || '—'}</p></div>
          <div className="caso-dato"><span>Teléfono</span><p>{detalle.telefono_estudiante || '—'}</p></div>
          <div className="caso-dato"><span>Correo</span><p>{detalle.correo_estudiante || '—'}</p></div>
        </div>

        <h4 className="caso-seccion-titulo">Horario en el consultorio</h4>
        {errorHorario && <div className="form-message error" style={{ marginBottom: 10 }}>{errorHorario}</div>}
        {turnosActuales === null ? (
          !errorHorario && <p className="admin-estado-cargando" style={{ margin: '0 0 18px' }}>Cargando horario...</p>
        ) : (
          <div style={{ marginBottom: 18 }}>
            <div className="horario-agregar">
              <select className="campo-select" value={diaSel} onChange={(e) => setDiaSel(e.target.value)} aria-label="Día de la semana">
                <option value="">Día de la semana</option>
                {DIAS.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <select className="campo-select" value={turnoSel} onChange={(e) => setTurnoSel(e.target.value)} aria-label="Turno">
                <option value="">Turno</option>
                {TURNOS.map((t) => <option key={t.id} value={t.id}>Turno {t.id} · {t.etiqueta}</option>)}
              </select>
              <button
                type="button"
                className="btn-primary"
                onClick={() => cambiarHorario(`${diaSel}-${turnoSel}`, true)}
                disabled={diaSel === '' || turnoSel === '' || guardandoHorario}
              >
                Agregar
              </button>
            </div>

            {asignados.length === 0 ? (
              <p className="texto-secundario" style={{ margin: '10px 0 0' }}>Todavía no tiene turnos asignados.</p>
            ) : (
              <div className="horario-chips">
                {asignados.map(({ clave, dia, turno }) => (
                  <span key={clave} className="horario-chip">
                    {nombreDia(dia)} · Turno {turno}
                    <button
                      type="button"
                      aria-label={`Quitar ${nombreDia(dia)}, turno ${turno}`}
                      onClick={() => cambiarHorario(clave, false)}
                      disabled={guardandoHorario}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <h4 className="caso-seccion-titulo">Asesorías asignadas</h4>
        {casosActuales?.error ? (
          <div className="form-message error">{casosActuales.error}</div>
        ) : !casosActuales?.lista ? (
          <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando asesorías...</p>
        ) : casosActuales.lista.length === 0 ? (
          <p className="admin-estado-vacio" style={{ margin: 0 }}>Todavía no tiene asesorías asignadas.</p>
        ) : (
          <>
            <p className="texto-secundario">
              {casosActuales.lista.length} {casosActuales.lista.length === 1 ? 'asesoría asignada' : 'asesorías asignadas'}
            </p>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {casosActuales.lista.map((c, i) => (
                <div key={`${c.asesoria_no ?? 'sin-numero'}-${i}`} className="detalle-caso-item">
                  <div><strong>N° {c.asesoria_no || 'sin número'}</strong></div>
                  <div>{c.nombres_apellidos || '—'}</div>
                  <div className="detalle-caso-area">{c.area_derecho || '—'}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    )}

    {/* Confirmar eliminación */}
    {eliminando && (
      <Modal
        onFuera={() => !trabajandoEliminar && setEliminando(null)}
        acciones={
          <>
            <button className="btn-secundario" onClick={() => setEliminando(null)} disabled={trabajandoEliminar}>Cancelar</button>
            <button className="btn-peligro" onClick={eliminar} disabled={trabajandoEliminar}>
              {trabajandoEliminar ? 'Eliminando...' : 'Eliminar'}
            </button>
          </>
        }
      >
        <h3>Eliminar estudiante</h3>
        <p className="texto-secundario" style={{ margin: '0 0 12px' }}>
          Se eliminará a <strong>{eliminando.nombre_estudiante}</strong> ({eliminando.codigo_estudiante}) del directorio,
          junto con su horario.
        </p>
        <p className="texto-secundario" style={{ marginBottom: 0 }}>Esta acción no se puede deshacer.</p>
        {errorEliminar && <div className="form-message error" style={{ margin: '12px 0 0' }}>{errorEliminar}</div>}
      </Modal>
    )}

    {/* Modal Nuevo / Editar estudiante (solo se cierra con sus botones) */}
    {modal && (
      <Modal
        acciones={
          <>
            <button className="btn-secundario" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <h3>{modal.id ? 'Editar estudiante' : 'Nuevo estudiante'}</h3>
        {errorModal && <div className="form-message error">{errorModal}</div>}
        {CAMPOS.map(([campo, label, tipo]) => (
          <Campo
            key={campo}
            label={label}
            tipo={tipo}
            valor={modal.datos[campo]}
            onCambio={(v) => setModal({ ...modal, datos: { ...modal.datos, [campo]: v } })}
          />
        ))}
        <CampoNivel
          valor={modal.datos.nivel_consultorio}
          onCambio={(v) => setModal({ ...modal, datos: { ...modal.datos, nivel_consultorio: v } })}
        />
      </Modal>
    )}
    </>
  );
}
