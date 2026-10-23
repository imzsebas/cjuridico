'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
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

const normalizar = (s: string) => s.trim().toLowerCase();

const VACIO = {
  nombre_estudiante: '', codigo_estudiante: '', telefono_estudiante: '',
  correo_estudiante: '', nivel_consultorio: NIVELES[0] as string,
};

const aPar = (clave: string) => {
  const [dia, turno] = clave.split('-').map(Number);
  return { dia, turno };
};

export default function EstudiantesPage() {
  const router = useRouter();
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ id: string | null; datos: typeof VACIO } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Modal con toda la información del estudiante (se abre al tocar una fila)
  const [detalle, setDetalle] = useState<Estudiante | null>(null);
  const [casos, setCasos] = useState<CasoAsignado[] | null>(null);
  const [errorCasos, setErrorCasos] = useState<string | null>(null);

  // Horario del estudiante: claves "dia-turno" (p. ej. "2-3" = martes, turno 3)
  const [horario, setHorario] = useState<Set<string> | null>(null);
  // Valores de los dos combos para agregar un turno
  const [diaSel, setDiaSel] = useState('');
  const [turnoSel, setTurnoSel] = useState('');
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [errorHorario, setErrorHorario] = useState<string | null>(null);
  const idDetalle = detalle?.id ?? null;

  // --- Búsqueda y filtro ---
  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<string>('TODOS');

  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (perfil?.rol !== 'administrador') router.replace('/login');
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // --- Paginación: se pide a la base de datos solo la página actual (15 registros) ---
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [busquedaAplicada, setBusquedaAplicada] = useState('');

  // La búsqueda espera un instante después de escribir, para no consultar en cada tecla
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusquedaAplicada(busqueda.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [busqueda]);

  useEffect(() => {
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
  }, [pagina, busquedaAplicada, filtroNivel, recarga]);

  // Asesorías asignadas al estudiante: se piden solo cuando se abre el modal.
  // "nombre_estudiante" puede traer varios nombres separados por coma, por eso se filtra después.
  useEffect(() => {
    if (!detalle) return;
    let cancelado = false;
    async function cargarCasos(nombre: string) {
      setCasos(null);
      setErrorCasos(null);
      const { data, error } = await supabase
        .from('libro_asesorias')
        .select('asesoria_no, nombres_apellidos, area_derecho, nombre_estudiante')
        .ilike('nombre_estudiante', `%${nombre.replace(/[\\%_]/g, '\\$&')}%`)
        .order('asesoria_no', { ascending: false })
        .limit(500);
      if (cancelado) return;
      if (error) {
        setErrorCasos(error.message);
        return;
      }
      const propios = (data ?? []).filter((c: CasoAsignado & { nombre_estudiante: string | null }) =>
        (c.nombre_estudiante ?? '').split(',').some((n) => normalizar(n) === normalizar(nombre))
      );
      setCasos(propios);
    }
    cargarCasos(detalle.nombre_estudiante);
    return () => { cancelado = true; };
  }, [detalle]);

  // Horario: se pide solo cuando se abre el modal de un estudiante
  useEffect(() => {
    if (!idDetalle) return;
    let cancelado = false;
    setHorario(null);
    setErrorHorario(null);
    setDiaSel('');
    setTurnoSel('');
    supabase
      .from('horarios_estudiantes')
      .select('dia, turno')
      .eq('id_estudiante', idDetalle)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) { setErrorHorario(error.message); return; }
        setHorario(new Set((data ?? []).map((h) => `${h.dia}-${h.turno}`)));
      });
    return () => { cancelado = true; };
  }, [idDetalle]);

  // Turnos asignados, ordenados por día y turno
  const asignados = horario
    ? [...horario].map((k) => ({ clave: k, ...aPar(k) })).sort((a, b) => a.dia - b.dia || a.turno - b.turno)
    : [];

  async function agregarTurno() {
    if (!detalle || !horario || diaSel === '' || turnoSel === '') return;
    const clave = `${diaSel}-${turnoSel}`;
    if (horario.has(clave)) { setErrorHorario('Ese turno ya está asignado.'); return; }
    setGuardandoHorario(true);
    setErrorHorario(null);
    const { error } = await supabase
      .from('horarios_estudiantes')
      .insert({ id_estudiante: detalle.id, dia: Number(diaSel), turno: Number(turnoSel) });
    setGuardandoHorario(false);
    if (error) { setErrorHorario(error.message); return; }
    setHorario(new Set(horario).add(clave));
  }

  async function quitarTurno(clave: string) {
    if (!detalle || !horario) return;
    const { dia, turno } = aPar(clave);
    setGuardandoHorario(true);
    setErrorHorario(null);
    const { error } = await supabase
      .from('horarios_estudiantes')
      .delete()
      .eq('id_estudiante', detalle.id)
      .eq('dia', dia)
      .eq('turno', turno);
    setGuardandoHorario(false);
    if (error) { setErrorHorario(error.message); return; }
    const copia = new Set(horario);
    copia.delete(clave);
    setHorario(copia);
  }

  function abrirEditar(e: Estudiante) {
    setDetalle(null);
    setModal({
      id: e.id,
      datos: {
        nombre_estudiante: e.nombre_estudiante,
        codigo_estudiante: e.codigo_estudiante,
        telefono_estudiante: e.telefono_estudiante ?? '',
        correo_estudiante: e.correo_estudiante ?? '',
        nivel_consultorio: e.nivel_consultorio,
      },
    });
  }

  async function guardar() {
    if (!modal) return;
    setGuardando(true);
    setError(null);
    const { id, datos } = modal;
    const { error } = id
      ? await supabase.from('estudiantes').update(datos).eq('id', id)
      : await supabase.from('estudiantes').insert(datos);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setModal(null);
    setRecarga((n) => n + 1);
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este estudiante del directorio?')) return;
    const { error } = await supabase.from('estudiantes').delete().eq('id', id);
    if (error) setError(error.message);
    else { setDetalle(null); setRecarga((n) => n + 1); }
  }

  return (
    <>
    <div className="cp-wrap">
      <PanelTopbar
        title="Estudiantes"
        subtitle={`${total} estudiantes · Directorio del consultorio`}
        action={
          <button className="cp-add-btn" onClick={() => setModal({ id: null, datos: { ...VACIO } })}>
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
                  onClick={() => setDetalle(e)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') setDetalle(e); }}
                >
                  <td>{e.nombre_estudiante}</td>
                  <td>{e.codigo_estudiante}</td>
                  <td>{e.telefono_estudiante || <span className="sin-dato">—</span>}</td>
                  <td>{e.correo_estudiante || <span className="sin-dato">—</span>}</td>
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
      <div className="modal-overlay" onClick={() => setDetalle(null)}>
        <div className="modal-card modal-card-ancho" onClick={(e) => e.stopPropagation()}>
          <div className="modal-card-cuerpo">
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
            {horario === null ? (
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
                    onClick={agregarTurno}
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
                          onClick={() => quitarTurno(clave)}
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
            {errorCasos ? (
              <div className="form-message error">{errorCasos}</div>
            ) : casos === null ? (
              <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando asesorías...</p>
            ) : casos.length === 0 ? (
              <p className="admin-estado-vacio" style={{ margin: 0 }}>Todavía no tiene asesorías asignadas.</p>
            ) : (
              <>
                <p className="texto-secundario">{casos.length} {casos.length === 1 ? 'asesoría asignada' : 'asesorías asignadas'}</p>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {casos.map((c, i) => (
                    <div key={`${c.asesoria_no ?? 'sin-numero'}-${i}`} className="detalle-caso-item">
                      <div><strong>N° {c.asesoria_no || 'sin número'}</strong></div>
                      <div>{c.nombres_apellidos || '—'}</div>
                      <div className="detalle-caso-area">{c.area_derecho || '—'}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="modal-acciones modal-acciones-compactas">
            <button className="btn-secundario btn-eliminar acciones-izquierda" onClick={() => eliminar(detalle.id)}>Eliminar</button>
            <button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>
            <button className="btn-primary" onClick={() => abrirEditar(detalle)}>Editar</button>
          </div>
        </div>
      </div>
    )}

    {modal && (
      <div className="modal-overlay">
        <div className="modal-card">
          <div className="modal-card-cuerpo">
            <h3>{modal.id ? 'Editar estudiante' : 'Nuevo estudiante'}</h3>

            <div className="field">
              <label>Nombre</label>
              <input
                type="text"
                value={modal.datos.nombre_estudiante}
                onChange={(e) => setModal({ ...modal, datos: { ...modal.datos, nombre_estudiante: e.target.value } })}
              />
            </div>
            <div className="field">
              <label>Código</label>
              <input
                type="text"
                value={modal.datos.codigo_estudiante}
                onChange={(e) => setModal({ ...modal, datos: { ...modal.datos, codigo_estudiante: e.target.value } })}
              />
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input
                type="text"
                value={modal.datos.telefono_estudiante}
                onChange={(e) => setModal({ ...modal, datos: { ...modal.datos, telefono_estudiante: e.target.value } })}
              />
            </div>
            <div className="field">
              <label>Correo</label>
              <input
                type="email"
                value={modal.datos.correo_estudiante}
                onChange={(e) => setModal({ ...modal, datos: { ...modal.datos, correo_estudiante: e.target.value } })}
              />
            </div>
            <div className="field">
              <label>Nivel de consultorio</label>
              <select
                className="campo-select"
                value={modal.datos.nivel_consultorio}
                onChange={(e) => setModal({ ...modal, datos: { ...modal.datos, nivel_consultorio: e.target.value } })}
              >
                {NIVELES.map((n) => <option key={n} value={n}>{etiquetaNivel(n)}</option>)}
              </select>
            </div>
          </div>

          <div className="modal-acciones modal-acciones-compactas">
            <button className="btn-secundario" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}