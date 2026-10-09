'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import {
  Monitor,
  asignarMonitores,
  editarCredenciales,
  generarPassword,
  listarMonitores,
  quitarRolMonitor,
} from '@/lib/apiMonitores';

const NIVELES = ['DERECHO PUBLICO', 'DERECHO PRIVADO', 'DERECHO LABORAL', 'DERECHO PENAL'] as const;

type Estudiante = {
  id: string;
  nombre_estudiante: string;
  codigo_estudiante: string;
  correo_estudiante: string | null;
  nivel_consultorio: string;
};

type Credencial = { correo: string; password: string };
type Mensaje = { tipo: 'error' | 'success'; texto: string };

const NUEVO_VACIO = {
  nombre_estudiante: '', codigo_estudiante: '', telefono_estudiante: '',
  correo_estudiante: '', nivel_consultorio: NIVELES[0] as string, password: '',
};

const minusculas = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO') : '—');

export default function MonitoresPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [monitores, setMonitores] = useState<Monitor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [recarga, setRecarga] = useState(0);

  // Lista: búsqueda + paginación (en el navegador; son pocos registros)
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  // Modales
  const [detalle, setDetalle] = useState<Monitor | null>(null);
  const [editando, setEditando] = useState<{ monitor: Monitor; correo: string; password: string } | null>(null);
  const [quitando, setQuitando] = useState<Monitor | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Modal "Asignar monitores"
  const [estudiantes, setEstudiantes] = useState<Estudiante[] | null>(null);
  const [busquedaEst, setBusquedaEst] = useState('');
  const [paginaEst, setPaginaEst] = useState(1);
  const [seleccion, setSeleccion] = useState<Record<string, Credencial>>({});
  const [erroresPorEst, setErroresPorEst] = useState<Record<string, string>>({});
  const [nuevo, setNuevo] = useState<typeof NUEVO_VACIO | null>(null);

  // Solo el administrador puede entrar aquí
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (perfil?.rol !== 'administrador') { router.replace('/login'); return; }
      setAutorizado(true);
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // Lista de monitores
  useEffect(() => {
    if (!autorizado) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      try {
        const lista = await listarMonitores();
        if (!cancelado) setMonitores(lista);
      } catch (e) {
        if (!cancelado) setMensaje({ tipo: 'error', texto: (e as Error).message });
      }
      if (!cancelado) setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [autorizado, recarga]);

  // Estudiantes (solo al abrir el modal de asignar o al agregar uno nuevo)
  const [recargaEst, setRecargaEst] = useState(0);
  useEffect(() => {
    if (!asignando) return;
    let cancelado = false;
    async function cargarEstudiantes() {
      const TAM = 1000;
      const todos: Estudiante[] = [];
      for (let desde = 0; ; desde += TAM) {
        const { data, error } = await supabase
          .from('estudiantes')
          .select('id, nombre_estudiante, codigo_estudiante, correo_estudiante, nivel_consultorio')
          .order('nombre_estudiante')
          .order('id')
          .range(desde, desde + TAM - 1);
        if (cancelado) return;
        if (error) { setErrorModal(error.message); setEstudiantes([]); return; }
        todos.push(...(data ?? []));
        if ((data?.length ?? 0) < TAM) break;
      }
      setEstudiantes(todos);
    }
    cargarEstudiantes();
    return () => { cancelado = true; };
  }, [asignando, recargaEst]);

  // ── Lista principal ──
  const filtrados = useMemo(() => {
    const q = minusculas(busqueda);
    if (!q) return monitores;
    return monitores.filter((m) =>
      [m.nombre, m.correo, m.codigo].some((v) => minusculas(v).includes(q))
    );
  }, [monitores, busqueda]);

  const paginasMax = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, paginasMax);
  const visibles = filtrados.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA);

  // ── Asignar ──
  // Quienes ya son monitores no se ofrecen de nuevo (por vínculo o por coincidir el correo)
  const idsMonitores = useMemo(() => new Set(monitores.map((m) => m.id_estudiante).filter(Boolean)), [monitores]);
  const correosMonitores = useMemo(() => new Set(monitores.map((m) => minusculas(m.correo))), [monitores]);
  const disponibles = useMemo(
    () => (estudiantes ?? []).filter((e) =>
      !idsMonitores.has(e.id) && !(e.correo_estudiante && correosMonitores.has(minusculas(e.correo_estudiante)))
    ),
    [estudiantes, idsMonitores, correosMonitores]
  );
  const disponiblesFiltrados = useMemo(() => {
    const q = minusculas(busquedaEst);
    return q ? disponibles.filter((e) => minusculas(e.nombre_estudiante).includes(q) || minusculas(e.codigo_estudiante).includes(q)) : disponibles;
  }, [disponibles, busquedaEst]);
  const paginasEst = Math.max(1, Math.ceil(disponiblesFiltrados.length / POR_PAGINA));
  const paginaEstSegura = Math.min(paginaEst, paginasEst);
  const estudiantesPagina = disponiblesFiltrados.slice((paginaEstSegura - 1) * POR_PAGINA, paginaEstSegura * POR_PAGINA);

  const idsSeleccionados = Object.keys(seleccion);
  const seleccionados = (estudiantes ?? []).filter((e) => seleccion[e.id]);

  function abrirAsignar() {
    setEstudiantes(null);
    setBusquedaEst('');
    setPaginaEst(1);
    setSeleccion({});
    setErroresPorEst({});
    setNuevo(null);
    setErrorModal(null);
    setAsignando(true);
  }

  function cerrarAsignar() {
    if (trabajando) return;
    setAsignando(false);
  }

  function alternar(e: Estudiante) {
    setSeleccion((prev) => {
      const copia = { ...prev };
      if (copia[e.id]) delete copia[e.id];
      else copia[e.id] = { correo: e.correo_estudiante ?? '', password: '' };
      return copia;
    });
  }

  function cambiarCredencial(id: string, campo: keyof Credencial, valor: string) {
    setSeleccion((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  // Envía a la API y deja marcados los que fallaron; los que salieron bien se quitan de la selección
  async function enviarAsignaciones(solicitudes: { id_estudiante: string; correo: string; password: string }[]) {
    const resultados = await asignarMonitores(solicitudes);
    const errores: Record<string, string> = {};
    resultados.forEach((r) => { if (!r.ok) errores[r.id_estudiante] = r.error ?? 'Error desconocido.'; });
    return { resultados, errores };
  }

  async function asignarSeleccionados() {
    setErrorModal(null);
    const solicitudes = idsSeleccionados.map((id) => ({
      id_estudiante: id,
      correo: seleccion[id].correo.trim(),
      password: seleccion[id].password,
    }));
    const incompleto = solicitudes.find((s) => !s.correo || !s.password);
    if (incompleto) {
      setErroresPorEst({ [incompleto.id_estudiante]: 'Escribe el correo y la contraseña.' });
      return;
    }
    setTrabajando(true);
    try {
      const { resultados, errores } = await enviarAsignaciones(solicitudes);
      setErroresPorEst(errores);
      const exitosos = resultados.filter((r) => r.ok).map((r) => r.id_estudiante);
      setSeleccion((prev) => {
        const copia = { ...prev };
        exitosos.forEach((id) => delete copia[id]);
        return copia;
      });
      setRecarga((n) => n + 1);
      if (Object.keys(errores).length === 0) {
        setAsignando(false);
        setMensaje({
          tipo: 'success',
          texto: exitosos.length === 1 ? 'Monitor asignado.' : `${exitosos.length} monitores asignados.`,
        });
      } else if (exitosos.length > 0) {
        setMensaje({ tipo: 'success', texto: `${exitosos.length} asignado(s). Revisa los que tuvieron error.` });
      }
    } catch (e) {
      setErrorModal((e as Error).message);
    }
    setTrabajando(false);
  }

  // "Agregar y asignar": crea el estudiante en el directorio y lo vuelve monitor en un solo paso
  async function agregarYAsignar() {
    if (!nuevo) return;
    setErrorModal(null);
    const datos = {
      nombre_estudiante: nuevo.nombre_estudiante.trim(),
      codigo_estudiante: nuevo.codigo_estudiante.trim(),
      telefono_estudiante: nuevo.telefono_estudiante.trim() || null,
      correo_estudiante: nuevo.correo_estudiante.trim(),
      nivel_consultorio: nuevo.nivel_consultorio,
    };
    if (!datos.nombre_estudiante || !datos.codigo_estudiante || !datos.correo_estudiante || !nuevo.password) {
      setErrorModal('Completa nombre, código, correo (con el que ingresará) y contraseña.');
      return;
    }
    setTrabajando(true);
    const { data: creado, error } = await supabase.from('estudiantes').insert(datos).select('id').single();
    if (error || !creado) {
      setTrabajando(false);
      setErrorModal(error?.code === '23505' ? 'Ya existe un estudiante con ese código.' : (error?.message ?? 'No se pudo agregar el estudiante.'));
      return;
    }
    try {
      const { errores } = await enviarAsignaciones([
        { id_estudiante: creado.id, correo: datos.correo_estudiante, password: nuevo.password },
      ]);
      if (errores[creado.id]) {
        // El estudiante quedó en el directorio; solo falló la cuenta. Se deja seleccionado para reintentar.
        setRecargaEst((n) => n + 1);
        setSeleccion((prev) => ({ ...prev, [creado.id]: { correo: datos.correo_estudiante, password: nuevo.password } }));
        setErroresPorEst({ [creado.id]: errores[creado.id] });
        setErrorModal('El estudiante se agregó al directorio, pero no se pudo crear su cuenta. Corrígelo abajo y vuelve a intentar.');
        setNuevo(null);
      } else {
        setNuevo(null);
        setRecarga((n) => n + 1);
        setAsignando(false);
        setMensaje({ tipo: 'success', texto: `${datos.nombre_estudiante} fue agregado y asignado como monitor.` });
      }
    } catch (e) {
      setErrorModal((e as Error).message);
    }
    setTrabajando(false);
  }

  // ── Editar credenciales ──
  async function guardarCredenciales() {
    if (!editando) return;
    setErrorModal(null);
    setTrabajando(true);
    try {
      await editarCredenciales(editando.monitor.id, {
        correo: editando.correo,
        password: editando.password || undefined,
      });
      setEditando(null);
      setRecarga((n) => n + 1);
      setMensaje({ tipo: 'success', texto: 'Credenciales actualizadas.' });
    } catch (e) {
      setErrorModal((e as Error).message);
    }
    setTrabajando(false);
  }

  // ── Quitar rol ──
  async function confirmarQuitar() {
    if (!quitando) return;
    setErrorModal(null);
    setTrabajando(true);
    try {
      await quitarRolMonitor(quitando.id);
      const nombre = quitando.nombre ?? quitando.correo;
      setQuitando(null);
      setRecarga((n) => n + 1);
      setMensaje({ tipo: 'success', texto: `Se quitó el rol de monitor a ${nombre}. Sus recepciones se conservan.` });
    } catch (e) {
      setErrorModal((e as Error).message);
    }
    setTrabajando(false);
  }

  if (!autorizado) return null;

  return (
    <>
      <div className="cp-wrap">
        <PanelTopbar
          title="Monitores"
          subtitle={`${monitores.length} ${monitores.length === 1 ? 'monitor activo' : 'monitores activos'} · Acceso a la recepción de casos`}
          action={
            <button className="cp-add-btn" onClick={abrirAsignar}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
              Asignar monitores
            </button>
          }
        />
        <div className="cp-content">
          {mensaje && (
            <div className={`form-message ${mensaje.tipo}`} style={{ maxWidth: 1600, margin: '0 auto 16px' }}>
              {mensaje.texto}
            </div>
          )}

          <div className="admin-toolbar">
            <input
              type="text"
              className="admin-input-busqueda"
              placeholder="Buscar por nombre, correo o código..."
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            />
            {!cargando && (
              <span className="admin-contador">
                {filtrados.length} {filtrados.length === 1 ? 'monitor' : 'monitores'}
              </span>
            )}
          </div>

          {cargando && monitores.length === 0 && <p className="admin-estado-cargando">Cargando...</p>}
          {!cargando && filtrados.length === 0 && (
            <p className="admin-estado-vacio">
              {busqueda ? 'No se encontraron monitores con ese criterio.' : 'Todavía no hay monitores. Usa “Asignar monitores” para agregar el primero.'}
            </p>
          )}

          {filtrados.length > 0 && (
            <div className="admin-table-card" style={{ opacity: cargando ? 0.6 : 1 }}>
              <table className="admin-table admin-table-compacta">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Código</th>
                    <th>Correo de ingreso</th>
                    <th>Nivel de consultorio</th>
                    <th>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((m) => (
                    <tr
                      key={m.id}
                      className="fila-clic"
                      tabIndex={0}
                      onClick={() => { setErrorModal(null); setDetalle(m); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') { setErrorModal(null); setDetalle(m); } }}
                    >
                      <td>{m.nombre || <span className="sin-dato">Sin ficha de estudiante</span>}</td>
                      <td>{m.codigo || <span className="sin-dato">—</span>}</td>
                      <td>{m.correo}</td>
                      <td>{m.nivel || <span className="sin-dato">—</span>}</td>
                      <td>{fechaCorta(m.creado_en)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Paginacion pagina={paginaSegura} total={filtrados.length} onCambiar={setPagina} />
        </div>
      </div>

      {/* Detalle del monitor: desde aquí se editan las credenciales o se quita el rol */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <div className="caso-encabezado"><h3>{detalle.nombre ?? detalle.correo}</h3></div>
              <div className="caso-datos">
                <div className="caso-dato"><span>Correo de ingreso</span><p>{detalle.correo}</p></div>
                <div className="caso-dato"><span>Código</span><p>{detalle.codigo || '—'}</p></div>
                <div className="caso-dato"><span>Nivel de consultorio</span><p>{detalle.nivel || '—'}</p></div>
                <div className="caso-dato"><span>Monitor desde</span><p>{fechaCorta(detalle.creado_en)}</p></div>
              </div>
            </div>
            <div className="modal-acciones">
              <button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>
              <button
                className="btn-secundario btn-eliminar"
                onClick={() => { setQuitando(detalle); setDetalle(null); }}
              >
                Quitar rol
              </button>
              <button
                className="btn-primary"
                onClick={() => { setEditando({ monitor: detalle, correo: detalle.correo, password: '' }); setDetalle(null); }}
              >
                Editar credenciales
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar credenciales */}
      {editando && (
        <div className="modal-overlay" onClick={() => !trabajando && setEditando(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <h3>Editar credenciales</h3>
              <p className="texto-secundario">{editando.monitor.nombre ?? editando.monitor.correo}</p>
              {errorModal && <div className="form-message error">{errorModal}</div>}
              <div className="field">
                <label htmlFor="mon-correo">Correo de ingreso</label>
                <input
                  id="mon-correo"
                  type="email"
                  value={editando.correo}
                  onChange={(e) => setEditando({ ...editando, correo: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="mon-pass">Nueva contraseña</label>
                <div className="cred-con-boton">
                  <input
                    id="mon-pass"
                    type="text"
                    autoComplete="off"
                    placeholder="Déjala vacía para no cambiarla"
                    value={editando.password}
                    onChange={(e) => setEditando({ ...editando, password: e.target.value })}
                  />
                  <button type="button" className="btn-secundario" onClick={() => setEditando({ ...editando, password: generarPassword() })}>
                    Generar
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-acciones">
              <button className="btn-secundario" onClick={() => setEditando(null)} disabled={trabajando}>Cancelar</button>
              <button className="btn-primary" onClick={guardarCredenciales} disabled={trabajando}>
                {trabajando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar quitar rol */}
      {quitando && (
        <div className="modal-overlay" onClick={() => !trabajando && setQuitando(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <h3>Quitar rol de monitor</h3>
              <p className="texto-secundario" style={{ margin: '0 0 12px' }}>
                <strong>{quitando.nombre ?? quitando.correo}</strong> ya no podrá ingresar a la aplicación y dejará de aparecer en esta lista.
              </p>
              <p className="texto-secundario" style={{ margin: '0 0 12px' }}>
                No se elimina nada: sus recepciones, asignaciones y archivos se conservan tal como están. Puedes volver a asignarle el rol cuando quieras.
              </p>
              {errorModal && <div className="form-message error">{errorModal}</div>}
            </div>
            <div className="modal-acciones">
              <button className="btn-secundario" onClick={() => setQuitando(null)} disabled={trabajando}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarQuitar} disabled={trabajando}>
                {trabajando ? 'Quitando...' : 'Quitar rol'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asignar monitores (varios a la vez) */}
      {asignando && (
        <div className="modal-overlay" onClick={cerrarAsignar}>
          <div className="modal-card modal-card-ancho" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <h3>Asignar monitores</h3>
              <p className="texto-secundario">
                Elige uno o varios estudiantes y define el correo y la contraseña con los que ingresarán.
              </p>
              {errorModal && <div className="form-message error">{errorModal}</div>}

              {nuevo ? (
                /* ── Nuevo estudiante ── */
                <>
                  <h4 className="caso-seccion-titulo">Nuevo estudiante</h4>
                  <div className="field">
                    <label>Nombre</label>
                    <input type="text" value={nuevo.nombre_estudiante} onChange={(e) => setNuevo({ ...nuevo, nombre_estudiante: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Código</label>
                    <input type="text" value={nuevo.codigo_estudiante} onChange={(e) => setNuevo({ ...nuevo, codigo_estudiante: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Teléfono (opcional)</label>
                    <input type="text" value={nuevo.telefono_estudiante} onChange={(e) => setNuevo({ ...nuevo, telefono_estudiante: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Nivel de consultorio</label>
                    <select
                      className="campo-select"
                      value={nuevo.nivel_consultorio}
                      onChange={(e) => setNuevo({ ...nuevo, nivel_consultorio: e.target.value })}
                    >
                      {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Correo (será su usuario de ingreso)</label>
                    <input type="email" value={nuevo.correo_estudiante} onChange={(e) => setNuevo({ ...nuevo, correo_estudiante: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Contraseña</label>
                    <div className="cred-con-boton">
                      <input type="text" autoComplete="off" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} />
                      <button type="button" className="btn-secundario" onClick={() => setNuevo({ ...nuevo, password: generarPassword() })}>Generar</button>
                    </div>
                  </div>
                </>
              ) : (
                /* ── Elegir de la lista ── */
                <>
                  <div className="field">
                    <label>Estudiantes</label>
                    <input
                      type="text"
                      className="busqueda-estudiantes"
                      placeholder="Buscar por nombre o código..."
                      value={busquedaEst}
                      onChange={(e) => { setBusquedaEst(e.target.value); setPaginaEst(1); }}
                    />
                    {estudiantes === null ? (
                      <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando estudiantes...</p>
                    ) : disponiblesFiltrados.length === 0 ? (
                      <p className="admin-estado-vacio" style={{ margin: 0 }}>
                        {busquedaEst ? 'Ningún estudiante coincide con la búsqueda.' : 'Todos los estudiantes ya son monitores.'}
                      </p>
                    ) : (
                      <>
                        <div className="lista-estudiantes">
                          {estudiantesPagina.map((e) => {
                            const marcado = !!seleccion[e.id];
                            return (
                              <div
                                key={e.id}
                                className={`estudiante-fila estudiante-fila-simple${marcado ? ' seleccionada' : ''}`}
                                onClick={() => alternar(e)}
                              >
                                <input
                                  type="checkbox"
                                  checked={marcado}
                                  onChange={() => alternar(e)}
                                  onClick={(ev) => ev.stopPropagation()}
                                />
                                <span className="estudiante-nombre" title={e.nombre_estudiante}>{e.nombre_estudiante}</span>
                                <span className="estudiante-codigo">({e.codigo_estudiante})</span>
                                <span className="estudiante-badge vacio">{e.nivel_consultorio.replace('DERECHO ', '')}</span>
                              </div>
                            );
                          })}
                        </div>
                        <Paginacion pagina={paginaEstSegura} total={disponiblesFiltrados.length} onCambiar={setPaginaEst} compacto />
                      </>
                    )}
                    <button type="button" className="btn-secundario cred-nuevo-btn" onClick={() => { setErrorModal(null); setNuevo({ ...NUEVO_VACIO }); }}>
                      + ¿No está en la lista? Agregar nuevo estudiante
                    </button>
                  </div>

                  {seleccionados.length > 0 && (
                    <>
                      <h4 className="caso-seccion-titulo">Credenciales de ingreso ({seleccionados.length})</h4>
                      <div className="cred-lista">
                        {seleccionados.map((e) => (
                          <div key={e.id} className="cred-fila">
                            <div className="cred-fila-nombre">{e.nombre_estudiante}</div>
                            <input
                              type="email"
                              placeholder="Correo de ingreso"
                              value={seleccion[e.id].correo}
                              onChange={(ev) => cambiarCredencial(e.id, 'correo', ev.target.value)}
                            />
                            <div className="cred-con-boton">
                              <input
                                type="text"
                                autoComplete="off"
                                placeholder="Contraseña"
                                value={seleccion[e.id].password}
                                onChange={(ev) => cambiarCredencial(e.id, 'password', ev.target.value)}
                              />
                              <button type="button" className="btn-secundario" onClick={() => cambiarCredencial(e.id, 'password', generarPassword())}>
                                Generar
                              </button>
                            </div>
                            {erroresPorEst[e.id] && <div className="cred-error">{erroresPorEst[e.id]}</div>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="modal-acciones">
              {nuevo ? (
                <>
                  <button className="btn-secundario" onClick={() => { setNuevo(null); setErrorModal(null); }} disabled={trabajando}>Volver a la lista</button>
                  <button className="btn-primary" onClick={agregarYAsignar} disabled={trabajando}>
                    {trabajando ? 'Guardando...' : 'Agregar y asignar'}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secundario" onClick={cerrarAsignar} disabled={trabajando}>Cancelar</button>
                  <button className="btn-primary" onClick={asignarSeleccionados} disabled={trabajando || idsSeleccionados.length === 0}>
                    {trabajando
                      ? 'Asignando...'
                      : idsSeleccionados.length > 1 ? `Asignar ${idsSeleccionados.length} monitores` : 'Asignar monitor'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
