'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar

// Esta página va en una ruta de administrador, por ejemplo: app/asignacion/page.tsx
// Requiere que en la tabla "recepciones" exista la columna "estudiante_asignado_nombre"
// (text, puede ser NULL). Si no existe todavía, créala en Supabase antes de probar.

type Registro = {
  id: string;
  asesoria_no: string | null;
  nombres_apellidos: string | null;
  area_derecho: string | null;
  estudiante_recepciona_nombre: string | null;
  nombre_estudiante: string | null; // viene de la vista libro_asesorias (asignación activa)
};

type Estudiante = { id: string; nombre_estudiante: string; codigo_estudiante: string };

const NIVELES = ['DERECHO PUBLICO', 'DERECHO PRIVADO', 'DERECHO LABORAL', 'DERECHO PENAL'] as const;

// El área de derecho del formulario es texto libre; esto es solo una adivinanza
// inicial para preseleccionar el nivel de consultorio. El admin puede corregirla.
function adivinarNivel(area: string | null): string {
  const a = (area || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (a.includes('PENAL')) return 'DERECHO PENAL';
  if (a.includes('LABORAL')) return 'DERECHO LABORAL';
  if (a.includes('PUBLIC')) return 'DERECHO PUBLICO';
  return 'DERECHO PRIVADO';
}

export default function AsignacionPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(null);

  // Modal de edición rápida (asesoría N°, nombres, área)
  const [editando, setEditando] = useState<Registro | null>(null);
  const [formEditar, setFormEditar] = useState({ asesoria_no: '', nombres_apellidos: '', area_derecho: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Modal de asignación (nivel de consultorio + checkboxes de estudiantes)
  const [asignando, setAsignando] = useState<Registro | null>(null);
  const [nivelAsignacion, setNivelAsignacion] = useState<string>(NIVELES[1]);
  const [estudiantesDisponibles, setEstudiantesDisponibles] = useState<Estudiante[]>([]);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [guardandoAsignacion, setGuardandoAsignacion] = useState(false);
  const [busquedaEstudiante, setBusquedaEstudiante] = useState('');

  // Modal de detalle: casos que ya tiene asignados un estudiante
  const [detalleEstudiante, setDetalleEstudiante] = useState<Estudiante | null>(null);

  // Solo el administrador puede entrar aquí
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (!perfil || perfil.rol !== 'administrador') { router.replace('/recepcion'); return; }
      cargarRegistros();
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  async function cargarRegistros() {
    setCargando(true);
    setMensaje(null);
    const { data, error } = await supabase
      .from('libro_asesorias')
      .select('id_recepcion, asesoria_no, nombres_apellidos, area_derecho, estudiante_recepciona_nombre, nombre_estudiante');

    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } else {
      setRegistros((data ?? []).map((r) => ({
        id: r.id_recepcion,
        asesoria_no: r.asesoria_no,
        nombres_apellidos: r.nombres_apellidos,
        area_derecho: r.area_derecho,
        estudiante_recepciona_nombre: r.estudiante_recepciona_nombre,
        nombre_estudiante: r.nombre_estudiante,
      })));
    }
    setCargando(false);
  }

  // La columna "Estudiante asignado" solo aparece cuando ya hay al menos una asignación hecha
  const hayAsignaciones = registros.some((r) => r.nombre_estudiante);

  function normalizar(s: string) {
    return s.trim().toLowerCase();
  }

  // Agrupa los registros de libro_asesorias por nombre de estudiante asignado.
  // Soporta el caso de que "nombre_estudiante" traiga varios nombres separados por coma.
  const registrosPorEstudiante = useMemo(() => {
    const mapa = new Map<string, Registro[]>();
    registros.forEach((r) => {
      if (!r.nombre_estudiante) return;
      r.nombre_estudiante.split(',').forEach((nombre) => {
        const clave = normalizar(nombre);
        if (!clave) return;
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave)!.push(r);
      });
    });
    return mapa;
  }, [registros]);

  function casosDe(nombreEstudiante: string): Registro[] {
    return registrosPorEstudiante.get(normalizar(nombreEstudiante)) ?? [];
  }

  function abrirEditar(registro: Registro) {
    setEditando(registro);
    setFormEditar({
      asesoria_no: registro.asesoria_no ?? '',
      nombres_apellidos: registro.nombres_apellidos ?? '',
      area_derecho: registro.area_derecho ?? '',
    });
  }

  async function guardarEdicion() {
    if (!editando) return;
    setGuardandoEdicion(true);
    const { error } = await supabase
      .from('recepciones')
      .update({
        asesoria_no: formEditar.asesoria_no || null,
        nombres_apellidos: formEditar.nombres_apellidos || null,
        area_derecho: formEditar.area_derecho || null,
      })
      .eq('id', editando.id);

    setGuardandoEdicion(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
      return;
    }
    setEditando(null);
    cargarRegistros();
  }

  function abrirAsignar(registro: Registro) {
    setAsignando(registro);
    setNivelAsignacion(adivinarNivel(registro.area_derecho));
    setSeleccionados(new Set());
    setBusquedaEstudiante('');
  }

  const estudiantesFiltradosModal = estudiantesDisponibles.filter((e) =>
    e.nombre_estudiante.toLowerCase().includes(busquedaEstudiante.trim().toLowerCase())
  );

  // Cada vez que cambia el nivel elegido (al abrir el modal, o si el admin lo corrige),
  // se recarga la lista de estudiantes de ese nivel.
  useEffect(() => {
    if (!asignando) return;
    let cancelado = false;
    async function cargarEstudiantes() {
      setCargandoEstudiantes(true);
      const { data, error } = await supabase
        .from('estudiantes')
        .select('id, nombre_estudiante, codigo_estudiante')
        .eq('nivel_consultorio', nivelAsignacion)
        .order('nombre_estudiante');
      if (cancelado) return;
      if (error) setMensaje({ tipo: 'error', texto: error.message });
      else setEstudiantesDisponibles(data ?? []);
      setCargandoEstudiantes(false);
    }
    cargarEstudiantes();
    return () => { cancelado = true; };
  }, [asignando, nivelAsignacion]);

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
      return nuevo;
    });
  }

  async function guardarAsignacion() {
    if (!asignando) return;
    setGuardandoAsignacion(true);
    const { error } = await supabase.rpc('asignar_recepcion', {
      p_id_recepcion: asignando.id,
      p_asesoria_no: asignando.asesoria_no,
      p_ids_estudiantes: [...seleccionados],
    });

    setGuardandoAsignacion(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
      return;
    }
    setAsignando(null);
    cargarRegistros();
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Recepción y asignación</h2>
        <p>Casos recibidos, listos para asignar a un estudiante.</p>
      </div>

      {mensaje && <div className={`form-message ${mensaje.tipo}`} style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{mensaje.texto}</div>}

      {cargando ? (
      <div className="admin-estado-cargando">Cargando registros...</div>
    ) : registros.length === 0 ? (
      <div className="admin-estado-vacio">Todavía no hay recepciones guardadas.</div>
    ) : (
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>N° de asesoría</th>
              <th>Usuario</th>
              <th>Área de derecho</th>
              <th>Estudiante que recepciona</th>
              {hayAsignaciones && <th>Estudiante asignado</th>}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className={!r.asesoria_no ? 'sin-dato' : ''}>{r.asesoria_no || 'Sin asignar'}</td>
                <td>{r.nombres_apellidos || '—'}</td>
                <td>{r.area_derecho || '—'}</td>
                <td>{r.estudiante_recepciona_nombre || '—'}</td>
                {hayAsignaciones && (
                  <td className={!r.nombre_estudiante ? 'sin-dato' : ''}>
                    {r.nombre_estudiante || 'Sin asignar'}
                  </td>
                )}
                <td>
                  <div className="admin-acciones">
                    <button className="btn-chip" onClick={() => abrirEditar(r)}>Editar</button>
                    <button className="btn-chip" onClick={() => abrirAsignar(r)}>Asignar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {/* Modal: edición rápida */}
    {editando && (
      <div className="modal-overlay" onClick={() => !guardandoEdicion && setEditando(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-card-cuerpo">
            <h3>Editar caso</h3>

            <div className="field">
              <label htmlFor="asesoria_no">N° de asesoría</label>
              <input
                id="asesoria_no"
                type="text"
                value={formEditar.asesoria_no}
                onChange={(e) => setFormEditar((f) => ({ ...f, asesoria_no: e.target.value }))}
                placeholder="Ej: 245"
              />
            </div>

            <div className="field">
              <label htmlFor="nombres_apellidos">Nombres y apellidos</label>
              <input
                id="nombres_apellidos"
                type="text"
                value={formEditar.nombres_apellidos}
                onChange={(e) => setFormEditar((f) => ({ ...f, nombres_apellidos: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="area_derecho">Área de derecho</label>
              <input
                id="area_derecho"
                type="text"
                value={formEditar.area_derecho}
                onChange={(e) => setFormEditar((f) => ({ ...f, area_derecho: e.target.value }))}
              />
            </div>
          </div>

          <div className="modal-acciones">
            <button className="btn-secundario" onClick={() => setEditando(null)} disabled={guardandoEdicion}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={guardarEdicion} disabled={guardandoEdicion}>
              {guardandoEdicion ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal: asignar estudiante(s) */}
    {asignando && (
      <div className="modal-overlay" onClick={() => !guardandoAsignacion && setAsignando(null)}>
        <div className="modal-card modal-card-ancho" onClick={(e) => e.stopPropagation()}>
          <div className="modal-card-cuerpo">
            <h3>Asignar estudiante</h3>

            <div className="field">
              <label htmlFor="nivel_consultorio">Nivel de consultorio</label>
              <select
                id="nivel_consultorio"
                className="campo-select"
                value={nivelAsignacion}
                onChange={(e) => setNivelAsignacion(e.target.value)}
              >
                {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Estudiantes</label>

              <input
                type="text"
                className="busqueda-estudiantes"
                placeholder="Buscar estudiante por nombre..."
                value={busquedaEstudiante}
                onChange={(e) => setBusquedaEstudiante(e.target.value)}
              />

              {cargandoEstudiantes ? (
                <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando estudiantes...</p>
              ) : estudiantesDisponibles.length === 0 ? (
                <p className="admin-estado-vacio" style={{ margin: 0 }}>
                  No hay estudiantes en este nivel de consultorio todavía.
                </p>
              ) : estudiantesFiltradosModal.length === 0 ? (
                <p className="admin-estado-vacio" style={{ margin: 0 }}>
                  Ningún estudiante coincide con &quot;{busquedaEstudiante}&quot;.
                </p>
              ) : (
                <div className="lista-estudiantes">
                  {estudiantesFiltradosModal.map((e) => {
                    const casos = casosDe(e.nombre_estudiante);
                    const seleccionado = seleccionados.has(e.id);
                    return (
                      <div
                        key={e.id}
                        className={`estudiante-fila${seleccionado ? ' seleccionada' : ''}`}
                        onClick={() => alternarSeleccion(e.id)}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionado}
                          onChange={() => alternarSeleccion(e.id)}
                          onClick={(ev) => ev.stopPropagation()}
                        />
                        <span className="estudiante-nombre" title={e.nombre_estudiante || undefined}>
                          {e.nombre_estudiante || '(sin nombre registrado)'}
                        </span>
                        <span className="estudiante-codigo">({e.codigo_estudiante})</span>
                        <span className={`estudiante-badge${casos.length === 0 ? ' vacio' : ''}`}>
                          {casos.length} {casos.length === 1 ? 'asesoría' : 'asesorías'}
                        </span>
                        <button
                          type="button"
                          className="btn-lupa"
                          disabled={casos.length === 0}
                          title={casos.length === 0 ? 'Sin asesorías asignadas todavía' : 'Ver casos asignados'}
                          onClick={(ev) => { ev.stopPropagation(); setDetalleEstudiante(e); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="modal-acciones">
            <button className="btn-secundario" onClick={() => setAsignando(null)} disabled={guardandoAsignacion}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={guardarAsignacion} disabled={guardandoAsignacion}>
              {guardandoAsignacion ? 'Guardando...' : 'Asignar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal: detalle de casos de un estudiante (se abre desde la lupa) */}
    {detalleEstudiante && (
      <div className="modal-overlay" onClick={() => setDetalleEstudiante(null)}>
        <div className="modal-card modal-card-ancho" onClick={(e) => e.stopPropagation()}>
          <div className="modal-card-cuerpo">
            <h3>Casos de {detalleEstudiante.nombre_estudiante}</h3>
            <p className="texto-secundario">
              {casosDe(detalleEstudiante.nombre_estudiante).length} asesoría(s) asignada(s)
            </p>

            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {casosDe(detalleEstudiante.nombre_estudiante).map((c) => (
                <div key={c.id} className="detalle-caso-item">
                  <div><strong>N° {c.asesoria_no || 'sin número'}</strong></div>
                  <div>{c.nombres_apellidos || '—'}</div>
                  <div className="detalle-caso-area">{c.area_derecho || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-acciones">
            <button className="btn-secundario" style={{ width: '100%' }} onClick={() => setDetalleEstudiante(null)}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}