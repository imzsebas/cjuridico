'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import { SeccionCaso, repartoDe, resumenCaso } from '@/lib/estructuraRecepcion';

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

const COLUMNAS = 'id_recepcion, asesoria_no, nombres_apellidos, area_derecho, estudiante_recepciona_nombre, nombre_estudiante';

type FilaLibro = {
  id_recepcion: string;
  asesoria_no: string | null;
  nombres_apellidos: string | null;
  area_derecho: string | null;
  estudiante_recepciona_nombre: string | null;
  nombre_estudiante: string | null;
};

function aRegistro(r: FilaLibro): Registro {
  return {
    id: r.id_recepcion,
    asesoria_no: r.asesoria_no,
    nombres_apellidos: r.nombres_apellidos,
    area_derecho: r.area_derecho,
    estudiante_recepciona_nombre: r.estudiante_recepciona_nombre,
    nombre_estudiante: r.nombre_estudiante,
  };
}

export default function AsignacionPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(null);

  // Paginación de la tabla principal (15 casos por página, pedidos a la base de datos)
  const [autorizado, setAutorizado] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [recarga, setRecarga] = useState(0);

  // Casos que ya tienen estudiante asignado (para contar y detallar por estudiante).
  // Solo se cargan al abrir el modal de asignar, en bloques de 1000 para no toparse con el límite de la API.
  const [casosAsignados, setCasosAsignados] = useState<Registro[] | null>(null);

  // Páginas dentro de los modales (listas en memoria)
  const [paginaModal, setPaginaModal] = useState(1);
  const [paginaDetalle, setPaginaDetalle] = useState(1);

  // Columna "Reparto" (Sí / No) de la página actual, sacada de lo que marcó el monitor en el formulario
  const [repartoPorId, setRepartoPorId] = useState<Record<string, 'Sí' | 'No' | null>>({});

  // Modal grande con toda la información del caso (se abre al tocar una fila)
  const [detalleCaso, setDetalleCaso] = useState<Registro | null>(null);
  const [datosCaso, setDatosCaso] = useState<SeccionCaso[] | null>(null);
  const [errorCaso, setErrorCaso] = useState<string | null>(null);

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
      setAutorizado(true);
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // Tabla principal: solo la página actual
  useEffect(() => {
    if (!autorizado) return;
    let cancelado = false;
    async function cargarRegistros() {
      setCargando(true);
      setMensaje(null);
      const desde = (pagina - 1) * POR_PAGINA;
      const { data, error, count } = await supabase
        .from('libro_asesorias')
        .select(COLUMNAS, { count: 'exact' })
        .order('asesoria_no', { ascending: false })
        .order('id_recepcion')
        .range(desde, desde + POR_PAGINA - 1);
      if (cancelado) return;
      if (error) {
        if (error.code === 'PGRST103' && pagina > 1) setPagina(pagina - 1);
        else setMensaje({ tipo: 'error', texto: error.message });
      } else {
        const filas = (data ?? []).map(aRegistro);
        // Reparto de los casos de esta página (viene del JSON "detalles" de recepciones)
        const { data: extra } = await supabase
          .from('recepciones')
          .select('id, detalles')
          .in('id', filas.map((f) => f.id));
        if (cancelado) return;
        const reparto: Record<string, 'Sí' | 'No' | null> = {};
        (extra ?? []).forEach((e: { id: string; detalles: unknown }) => { reparto[e.id] = repartoDe(e.detalles); });
        setRepartoPorId(reparto);
        setRegistros(filas);
        setTotal(count ?? 0);
      }
      setCargando(false);
    }
    cargarRegistros();
    return () => { cancelado = true; };
  }, [autorizado, pagina, recarga]);

  // Casos asignados (solo cuando se abre el modal de asignar)
  useEffect(() => {
    if (!asignando || casosAsignados !== null) return;
    let cancelado = false;
    async function cargarCasos() {
      const TAM = 1000;
      const todos: Registro[] = [];
      for (let desde = 0; ; desde += TAM) {
        const { data, error } = await supabase
          .from('libro_asesorias')
          .select(COLUMNAS)
          .not('nombre_estudiante', 'is', null)
          .order('id_recepcion')
          .range(desde, desde + TAM - 1);
        if (cancelado) return;
        if (error) {
          setMensaje({ tipo: 'error', texto: error.message });
          setCasosAsignados([]);
          return;
        }
        (data ?? []).forEach((r: FilaLibro) => todos.push(aRegistro(r)));
        if ((data?.length ?? 0) < TAM) break;
      }
      setCasosAsignados(todos);
    }
    cargarCasos();
    return () => { cancelado = true; };
  }, [asignando, casosAsignados]);

  // Información completa del caso: se pide solo cuando se abre el modal de detalle
  useEffect(() => {
    if (!detalleCaso) return;
    let cancelado = false;
    async function cargarCaso(id: string) {
      setDatosCaso(null);
      setErrorCaso(null);
      const { data, error } = await supabase.from('recepciones').select('*').eq('id', id).single();
      if (cancelado) return;
      if (error || !data) {
        setErrorCaso(error?.message ?? 'No se encontró el caso.');
        return;
      }
      setDatosCaso(resumenCaso(data));
    }
    cargarCaso(detalleCaso.id);
    return () => { cancelado = true; };
  }, [detalleCaso]);

  function normalizar(s: string) {
    return s.trim().toLowerCase();
  }

  // Agrupa los registros de libro_asesorias por nombre de estudiante asignado.
  // Soporta el caso de que "nombre_estudiante" traiga varios nombres separados por coma.
  const registrosPorEstudiante = useMemo(() => {
    const mapa = new Map<string, Registro[]>();
    (casosAsignados ?? []).forEach((r) => {
      if (!r.nombre_estudiante) return;
      r.nombre_estudiante.split(',').forEach((nombre) => {
        const clave = normalizar(nombre);
        if (!clave) return;
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave)!.push(r);
      });
    });
    return mapa;
  }, [casosAsignados]);

  function casosDe(nombreEstudiante: string): Registro[] {
    return registrosPorEstudiante.get(normalizar(nombreEstudiante)) ?? [];
  }

  function cerrarDetalle() {
    setDetalleCaso(null);
  }

  function abrirAsignar(registro: Registro) {
    setAsignando(registro);
    setNivelAsignacion(adivinarNivel(registro.area_derecho));
    setSeleccionados(new Set());
    setBusquedaEstudiante('');
    setPaginaModal(1);
  }

  const estudiantesFiltradosModal = estudiantesDisponibles.filter((e) =>
    e.nombre_estudiante.toLowerCase().includes(busquedaEstudiante.trim().toLowerCase())
  );

  // Lista del modal paginada de 15 en 15 (la selección se conserva al cambiar de página)
  const paginasModal = Math.max(1, Math.ceil(estudiantesFiltradosModal.length / POR_PAGINA));
  const paginaModalSegura = Math.min(paginaModal, paginasModal);
  const estudiantesModalPagina = estudiantesFiltradosModal.slice(
    (paginaModalSegura - 1) * POR_PAGINA,
    paginaModalSegura * POR_PAGINA
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
    setCasosAsignados(null);
    setRecarga((n) => n + 1);
  }

  const casosDetalle = detalleEstudiante ? casosDe(detalleEstudiante.nombre_estudiante) : [];
  const paginasDetalle = Math.max(1, Math.ceil(casosDetalle.length / POR_PAGINA));
  const paginaDetalleSegura = Math.min(paginaDetalle, paginasDetalle);
  const casosDetallePagina = casosDetalle.slice(
    (paginaDetalleSegura - 1) * POR_PAGINA,
    paginaDetalleSegura * POR_PAGINA
  );

  return (
    <div className="cp-wrap">
      <PanelTopbar title="Recepción y asignación" subtitle="Casos recibidos, listos para asignar a un estudiante." />
      <div className="cp-content">

      {mensaje && <div className={`form-message ${mensaje.tipo}`} style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{mensaje.texto}</div>}

      {cargando && registros.length === 0 ? (
      <div className="admin-estado-cargando">Cargando registros...</div>
    ) : registros.length === 0 ? (
      <div className="admin-estado-vacio">Todavía no hay recepciones guardadas.</div>
    ) : (
      <div className="admin-table-card" style={{ opacity: cargando ? 0.6 : 1 }}>
        <table className="admin-table admin-table-compacta">
          <thead>
            <tr>
              <th>N° de asesoría</th>
              <th>Usuario</th>
              <th>Área de derecho</th>
              <th>Estudiante que recepciona</th>
              <th>Estudiante asignado</th>
              <th>Reparto</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => {
              const reparto = repartoPorId[r.id] ?? null;
              return (
                <tr
                  key={r.id}
                  className="fila-clic"
                  tabIndex={0}
                  onClick={() => setDetalleCaso(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setDetalleCaso(r); }}
                >
                  <td className={!r.asesoria_no ? 'sin-dato' : ''}>{r.asesoria_no || 'Sin asignar'}</td>
                  <td>{r.nombres_apellidos || '—'}</td>
                  <td>{r.area_derecho || '—'}</td>
                  <td>{r.estudiante_recepciona_nombre || '—'}</td>
                  <td className={!r.nombre_estudiante ? 'sin-dato' : ''}>
                    {r.nombre_estudiante || 'Sin asignar'}
                  </td>
                  <td>
                    {reparto ? (
                      <span className={`badge-reparto ${reparto === 'Sí' ? 'si' : 'no'}`}>{reparto}</span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />

    {/* Modal grande: toda la información del caso. Aquí solo se puede asignar o cerrar (los datos se editan en el Libro de asesorías) */}
    {detalleCaso && (
      <div className="modal-overlay" onClick={cerrarDetalle}>
        <div className="modal-card modal-card-grande" onClick={(e) => e.stopPropagation()}>
          <div className="modal-card-cuerpo">
            <div className="caso-encabezado">
              <h3>
                Asesoría N° {detalleCaso.asesoria_no || 'sin número'}
              </h3>
            </div>

                <div className="caso-resumen">
                  <div><span>Usuario</span><strong>{detalleCaso.nombres_apellidos || '—'}</strong></div>
                  <div><span>Estudiante asignado</span><strong>{detalleCaso.nombre_estudiante || 'Sin asignar'}</strong></div>
                  <div><span>Reparto</span><strong>{repartoPorId[detalleCaso.id] ?? '—'}</strong></div>
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
          </div>

          <div className="modal-acciones">
            <button className="btn-secundario" onClick={cerrarDetalle}>Cerrar</button>
            <button
              className="btn-primary"
              onClick={() => { const r = detalleCaso; cerrarDetalle(); abrirAsignar(r); }}
            >
              Asignar
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
                onChange={(e) => { setNivelAsignacion(e.target.value); setPaginaModal(1); }}
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
                onChange={(e) => { setBusquedaEstudiante(e.target.value); setPaginaModal(1); }}
              />

              {cargandoEstudiantes || casosAsignados === null ? (
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
                <>
                <div className="lista-estudiantes">
                  {estudiantesModalPagina.map((e) => {
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
                          onClick={(ev) => { ev.stopPropagation(); setPaginaDetalle(1); setDetalleEstudiante(e); }}
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
                <Paginacion
                  compacto
                  pagina={paginaModalSegura}
                  total={estudiantesFiltradosModal.length}
                  onCambiar={setPaginaModal}
                />
                </>
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
              {casosDetallePagina.map((c) => (
                <div key={c.id} className="detalle-caso-item">
                  <div><strong>N° {c.asesoria_no || 'sin número'}</strong></div>
                  <div>{c.nombres_apellidos || '—'}</div>
                  <div className="detalle-caso-area">{c.area_derecho || '—'}</div>
                </div>
              ))}
            </div>
            <Paginacion
              compacto
              pagina={paginaDetalleSegura}
              total={casosDetalle.length}
              onCambiar={setPaginaDetalle}
            />
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
    </div>
  );
}