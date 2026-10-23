'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion from '@/components/Paginacion';
import { NIVELES, etiquetaNivel } from '@/lib/niveles';
import { etiquetaTurno, momentoActual, nombreDia, textoSiguienteTurno } from '@/lib/turnos';

// Pantalla "Asignar": un bloque por estudiante con una subfila por cada asesoría.
// Las asesorías reasignadas (activa = false) quedan como historial, en rojo.
// Requiere el SQL "asignaciones_reasignacion.sql" (columnas observaciones y
// fecha_reasignacion + funciones asignar_asesoria, reasignar_asesoria y quitar_asignacion).

const ESTUDIANTES_POR_PAGINA = 10;

type Orden = 'nombre' | 'reciente' | 'mas' | 'menos';
type CampoBusqueda = 'nombre' | 'codigo' | 'asesoria';

const PLACEHOLDER_BUSQUEDA: Record<CampoBusqueda, string> = {
  nombre: 'Buscar por nombre del estudiante...',
  codigo: 'Buscar por código del estudiante...',
  asesoria: 'Buscar por N° de asesoría...',
};

type Estudiante = {
  id: string;
  codigo_estudiante: string;
  nombre_estudiante: string;
  nivel_consultorio: string;
};

type Asignacion = {
  id: string;
  id_estudiante: string;
  id_recepcion: string;
  asesoria_no: string | null;
  fecha_asignacion: string;
  activa: boolean;
  observaciones: string | null;
  fecha_reasignacion: string | null;
  area_derecho: string | null;
  naturaleza_asunto: string | null;
};

type FilaAsignacionBD = Omit<Asignacion, 'area_derecho' | 'naturaleza_asunto'> & {
  recepciones:
    | { asesoria_no: string | null; area_derecho: string | null; naturaleza_asunto: string | null }
    | { asesoria_no: string | null; area_derecho: string | null; naturaleza_asunto: string | null }[]
    | null;
};

type Titular = { idAsignacion: string; idEstudiante: string; nombre: string; codigo: string; fecha: string };

type Busqueda =
  | { estado: 'vacio' }
  | { estado: 'buscando' }
  | { estado: 'noexiste' }
  | { estado: 'error'; texto: string }
  | {
      estado: 'ok';
      recepcion: { id: string; asesoria_no: string; area_derecho: string | null; naturaleza_asunto: string | null; nombres_apellidos: string | null };
      titulares: Titular[];
    };

// Fecha de hoy en la zona horaria del navegador (toISOString usaría UTC y a veces da el día siguiente)
function hoyLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function traerTodo<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const TAM = 1000;
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await pedir(desde, desde + TAM - 1);
    if (error) throw new Error(error.message);
    todo.push(...(data ?? []));
    if ((data?.length ?? 0) < TAM) break;
  }
  return todo;
}

export default function AsignacionPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [campo, setCampo] = useState<CampoBusqueda>('nombre');
  const [nivel, setNivel] = useState('');
  const [orden, setOrden] = useState<Orden>('nombre');
  const [pagina, setPagina] = useState(1);

  // "Disponible ahora": estudiantes cuyo horario incluye el turno en curso (hora de Colombia)
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const [enTurno, setEnTurno] = useState<Set<string>>(new Set());
  const momento = momentoActual(ahora);
  const turnoEnCurso = momento.turno;
  const diaEnCurso = momento.dia;

  const [asignandoA, setAsignandoA] = useState<Estudiante | null>(null);
  const [quitando, setQuitando] = useState<Asignacion | null>(null);
  const [quitandoEnCurso, setQuitandoEnCurso] = useState(false);

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

  // El reloj se actualiza cada minuto, para que el turno en curso cambie solo
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Quiénes están en el turno en curso
  useEffect(() => {
    if (!autorizado) return;
    if (!turnoEnCurso) { setEnTurno(new Set()); return; }
    let cancelado = false;
    supabase
      .from('horarios_estudiantes')
      .select('id_estudiante')
      .eq('dia', diaEnCurso)
      .eq('turno', turnoEnCurso)
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelado || error) return;
        setEnTurno(new Set((data ?? []).map((h) => h.id_estudiante as string)));
      });
    return () => { cancelado = true; };
  }, [autorizado, diaEnCurso, turnoEnCurso, recarga]);

  // Estudiantes + asignaciones (activas e historial), en bloques de 1000
  useEffect(() => {
    if (!autorizado) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      try {
        const [ests, asigs] = await Promise.all([
          traerTodo<Estudiante>((d, h) =>
            supabase
              .from('estudiantes')
              .select('id, codigo_estudiante, nombre_estudiante, nivel_consultorio')
              .order('nombre_estudiante')
              .order('id')
              .range(d, h)
          ),
          traerTodo<FilaAsignacionBD>((d, h) =>
            supabase
              .from('asignaciones')
              .select(
                'id, id_estudiante, id_recepcion, asesoria_no, fecha_asignacion, activa, observaciones, fecha_reasignacion, recepciones ( asesoria_no, area_derecho, naturaleza_asunto )'
              )
              .order('id')
              .range(d, h)
          ),
        ]);
        if (cancelado) return;
        setEstudiantes(ests);
        setAsignaciones(
          asigs.map((r) => {
            const rec = Array.isArray(r.recepciones) ? r.recepciones[0] : r.recepciones;
            return {
              id: r.id,
              id_estudiante: r.id_estudiante,
              id_recepcion: r.id_recepcion,
              asesoria_no: rec?.asesoria_no ?? r.asesoria_no,
              fecha_asignacion: r.fecha_asignacion,
              activa: r.activa,
              observaciones: r.observaciones,
              fecha_reasignacion: r.fecha_reasignacion,
              area_derecho: rec?.area_derecho ?? null,
              naturaleza_asunto: rec?.naturaleza_asunto ?? null,
            };
          })
        );
      } catch (e) {
        if (!cancelado) setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron cargar los datos.' });
      }
      if (!cancelado) setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [autorizado, recarga]);

  // Asignaciones agrupadas por estudiante: primero las activas, luego el historial en rojo
  const porEstudiante = useMemo(() => {
    const mapa = new Map<string, Asignacion[]>();
    asignaciones.forEach((a) => {
      if (!mapa.has(a.id_estudiante)) mapa.set(a.id_estudiante, []);
      mapa.get(a.id_estudiante)!.push(a);
    });
    mapa.forEach((lista) =>
      lista.sort((x, y) => {
        if (x.activa !== y.activa) return x.activa ? -1 : 1;
        const nx = Number(x.asesoria_no), ny = Number(y.asesoria_no);
        if (!Number.isNaN(nx) && !Number.isNaN(ny) && nx !== ny) return ny - nx;
        return (y.fecha_asignacion || '').localeCompare(x.fecha_asignacion || '');
      })
    );
    return mapa;
  }, [asignaciones]);

  // Filtra por nivel y por el texto buscado en el campo elegido (nombre, código o N° de asesoría)
  // y ordena según lo elegido. Los empates se resuelven por nombre.
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    const lista = estudiantes.filter((e) => {
      if (nivel && e.nivel_consultorio !== nivel) return false;
      if (soloDisponibles && !enTurno.has(e.id)) return false;
      if (!q) return true;
      if (campo === 'nombre') return normalizar(e.nombre_estudiante).includes(q);
      if (campo === 'codigo') return normalizar(e.codigo_estudiante).includes(q);
      return (porEstudiante.get(e.id) ?? []).some((a) => (a.asesoria_no ?? '').toLowerCase().includes(q));
    });
    if (orden === 'nombre') return lista; // ya vienen ordenados por nombre
    const activos = (e: Estudiante) => (porEstudiante.get(e.id) ?? []).filter((a) => a.activa).length;
    const ultima = (e: Estudiante) =>
      (porEstudiante.get(e.id) ?? []).reduce((max, a) => (a.fecha_asignacion > max ? a.fecha_asignacion : max), '');
    return [...lista].sort((x, y) => {
      let d = 0;
      if (orden === 'mas') d = activos(y) - activos(x);
      else if (orden === 'menos') d = activos(x) - activos(y);
      else {
        const ux = ultima(x), uy = ultima(y);
        if (ux !== uy) d = !ux ? 1 : !uy ? -1 : uy.localeCompare(ux); // sin asignaciones, al final
      }
      return d || x.nombre_estudiante.localeCompare(y.nombre_estudiante);
    });
  }, [estudiantes, busqueda, campo, nivel, orden, porEstudiante, soloDisponibles, enTurno]);

  const paginasTotales = Math.max(1, Math.ceil(filtrados.length / ESTUDIANTES_POR_PAGINA));
  const paginaSegura = Math.min(pagina, paginasTotales);
  const visibles = filtrados.slice((paginaSegura - 1) * ESTUDIANTES_POR_PAGINA, paginaSegura * ESTUDIANTES_POR_PAGINA);

  async function guardarObservacion(a: Asignacion, texto: string) {
    const nuevo = texto.trim() || null;
    if ((a.observaciones ?? null) === nuevo) return;
    const { error } = await supabase.from('asignaciones').update({ observaciones: nuevo }).eq('id', a.id);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
      setRecarga((n) => n + 1); // vuelve a mostrar lo que hay guardado
      return;
    }
    setAsignaciones((prev) => prev.map((x) => (x.id === a.id ? { ...x, observaciones: nuevo } : x)));
  }

  async function confirmarQuitar() {
    if (!quitando) return;
    setQuitandoEnCurso(true);
    const { error } = await supabase.rpc('quitar_asignacion', { p_id_asignacion: quitando.id });
    setQuitandoEnCurso(false);
    if (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } else {
      setMensaje({ tipo: 'success', texto: `Se quitó la asignación de la asesoría N° ${quitando.asesoria_no ?? ''}.` });
      setRecarga((n) => n + 1);
    }
    setQuitando(null);
  }

  const nombreQuitando = quitando ? estudiantes.find((e) => e.id === quitando.id_estudiante)?.nombre_estudiante : null;

  return (
    <div className="cp-wrap">
      <PanelTopbar title="Asignar" subtitle="Asesorías de cada estudiante. Toca el nombre de un estudiante para asignarle una asesoría." />
      <div className="cp-content">
        {mensaje && (
          <div className={`form-message ${mensaje.tipo}`} style={{ maxWidth: 1600, margin: '0 auto 16px' }}>
            {mensaje.texto}
          </div>
        )}

        <div className="admin-toolbar">
          <select
            className="admin-select-filtro"
            value={campo}
            aria-label="Buscar por"
            onChange={(e) => { setCampo(e.target.value as CampoBusqueda); setPagina(1); }}
          >
            <option value="nombre">Buscar por: Nombre</option>
            <option value="codigo">Buscar por: Código</option>
            <option value="asesoria">Buscar por: N° de asesoría</option>
          </select>
          <input
            type="text"
            className="admin-input-busqueda"
            placeholder={PLACEHOLDER_BUSQUEDA[campo]}
            inputMode={campo === 'nombre' ? 'text' : 'numeric'}
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
          />
          <select className="admin-select-filtro" value={nivel} onChange={(e) => { setNivel(e.target.value); setPagina(1); }}>
            <option value="">Todos los niveles</option>
             {NIVELES.map((n) => <option key={n} value={n}>{etiquetaNivel(n)}</option>)}
          </select>
          <select className="admin-select-filtro" value={orden} onChange={(e) => { setOrden(e.target.value as Orden); setPagina(1); }}>
            <option value="nombre">Orden: nombre (A–Z)</option>
            <option value="reciente">Última asignación más reciente</option>
            <option value="mas">Más asesorías activas</option>
            <option value="menos">Menos asesorías activas</option>
          </select>
          <button
            type="button"
            className={`btn-chip filtro-ahora${soloDisponibles ? ' activo' : ''}`}
            aria-pressed={soloDisponibles}
            title="Mostrar solo a quienes están en turno en este momento"
            onClick={() => { setSoloDisponibles((v) => !v); setPagina(1); }}
          >
            <span className={`punto-turno${turnoEnCurso ? '' : ' apagado'}`} />
            Disponible ahora
          </button>
          <span className="admin-contador">{filtrados.length} estudiante(s)</span>
        </div>

        {soloDisponibles && (
          <p className="texto-secundario" style={{ margin: '0 0 12px' }}>
            {turnoEnCurso
              ? `Turno en curso: ${nombreDia(diaEnCurso)}, turno ${turnoEnCurso} (${etiquetaTurno(turnoEnCurso)}).`
              : `No hay turno en este momento. El próximo es ${textoSiguienteTurno(ahora)}.`}
          </p>
        )}

        {cargando && estudiantes.length === 0 ? (
          <div className="admin-estado-cargando">Cargando estudiantes...</div>
        ) : filtrados.length === 0 ? (
          <div className="admin-estado-vacio">
            {soloDisponibles && !busqueda && !nivel ? 'No hay estudiantes en turno en este momento.' : 'No hay estudiantes que coincidan.'}
          </div>
        ) : (
          <div className="admin-table-card" style={{ opacity: cargando ? 0.6 : 1 }}>
            <table className="admin-table admin-table-compacta asig-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>N° de asesoría</th>
                  <th>Área</th>
                  <th>Asunto</th>
                  <th>Observaciones</th>
                  <th>Fecha de asignación</th>
                </tr>
              </thead>
              <tbody>
                {visibles.flatMap((e, idx) => {
                  const todas = porEstudiante.get(e.id) ?? [];
                  const qAses = campo === 'asesoria' ? busqueda.trim().toLowerCase() : '';
                  // Buscando por N° de asesoría solo se muestran las asesorías que coinciden
                  const filas = qAses ? todas.filter((a) => (a.asesoria_no ?? '').toLowerCase().includes(qAses)) : todas;
                  const n = Math.max(1, filas.length);
                  return Array.from({ length: n }, (_, i) => {
                    const a = filas[i];
                    const hist = a && !a.activa ? ' asig-historial' : '';
                    return (
                      <tr key={`${e.id}-${a?.id ?? 'vacio'}`} className={`${i === 0 ? 'asig-inicio-bloque' : ''}${idx % 2 === 1 ? ' asig-par' : ''}`.trim() || undefined}>
                        {i === 0 && (
                          <>
                            <td rowSpan={n} className="asig-codigo">{e.codigo_estudiante}</td>
                            <td rowSpan={n} className="asig-celda-nombre">
                              <button
                                type="button"
                                className="asig-nombre"
                                title="Asignar una asesoría a este estudiante"
                                onClick={() => { setMensaje(null); setAsignandoA(e); }}
                              >
                                {e.nombre_estudiante}
                              </button>
                              {enTurno.has(e.id) && (
                                <span className="badge-turno" title="Está en turno en este momento">
                                  <span className="punto-turno" />En turno
                                </span>
                              )}
                            </td>
                          </>
                        )}
                        {!a ? (
                          <td colSpan={5} className="sin-dato">Sin asesorías asignadas</td>
                        ) : (
                          <>
                            <td
                              className={`asig-num${hist}`}
                              title={!a.activa ? `Reasignada el ${formatearFecha(a.fecha_reasignacion)}` : undefined}
                            >
                              {a.asesoria_no || '—'}
                            </td>
                            <td className={hist.trim()}>{a.area_derecho || '—'}</td>
                            <td className={`asig-asunto${hist}`} title={a.naturaleza_asunto || undefined}>
                              <div>{a.naturaleza_asunto || '—'}</div>
                            </td>
                            <td className={`asig-obs${hist}`}>
                              <textarea
                                key={`${a.id}|${a.observaciones ?? ''}`}
                                className="asig-obs-input"
                                rows={1}
                                defaultValue={a.observaciones ?? ''}
                                placeholder="Añadir observación..."
                                onBlur={(ev) => guardarObservacion(a, ev.target.value)}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.currentTarget.blur(); }
                                }}
                              />
                            </td>
                            <td className="asig-fecha">
                              <span>{formatearFecha(a.fecha_asignacion)}</span>
                              <button
                                type="button"
                                className="asig-quitar"
                                title="Quitar esta asignación sin dejar historial"
                                aria-label="Quitar asignación"
                                onClick={() => setQuitando(a)}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                                </svg>
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion pagina={paginaSegura} total={filtrados.length} porPagina={ESTUDIANTES_POR_PAGINA} onCambiar={setPagina} />

        {asignandoA && (
          <ModalAsignar
            estudiante={asignandoA}
            onCerrar={() => setAsignandoA(null)}
            onHecho={(texto) => {
              setAsignandoA(null);
              setMensaje({ tipo: 'success', texto });
              setRecarga((n) => n + 1);
            }}
          />
        )}

        {quitando && (
          <div className="modal-overlay" onClick={() => !quitandoEnCurso && setQuitando(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-card-cuerpo">
                <h3>Quitar asignación</h3>
                <p className="texto-secundario" style={{ marginTop: 0 }}>
                  Se borrará la asesoría N° <strong>{quitando.asesoria_no || 'sin número'}</strong> de{' '}
                  <strong>{nombreQuitando || 'este estudiante'}</strong> sin dejar historial. Úsalo solo para corregir un error.
                </p>
                <p className="texto-secundario" style={{ marginBottom: 0 }}>Esta acción no se puede deshacer.</p>
              </div>
              <div className="modal-acciones modal-acciones-compactas">
                <button className="btn-secundario" onClick={() => setQuitando(null)} disabled={quitandoEnCurso}>Cancelar</button>
                <button className="btn-peligro" onClick={confirmarQuitar} disabled={quitandoEnCurso}>
                  {quitandoEnCurso ? 'Quitando...' : 'Quitar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalAsignar({
  estudiante,
  onCerrar,
  onHecho,
}: {
  estudiante: Estudiante;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [observaciones, setObservaciones] = useState('');
  const [busq, setBusq] = useState<Busqueda>({ estado: 'vacio' });
  const [paso, setPaso] = useState<'datos' | 'reasignar'>('datos');
  const [saliente, setSaliente] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al escribir el número se busca la asesoría (con una pequeña espera) y quién la tiene activa
  useEffect(() => {
    const n = numero.trim();
    if (!n) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      const { data: recs, error: e1 } = await supabase
        .from('recepciones')
        .select('id, asesoria_no, area_derecho, naturaleza_asunto, nombres_apellidos')
        .eq('asesoria_no', n)
        .limit(2);
      if (cancelado) return;
      if (e1) { setBusq({ estado: 'error', texto: e1.message }); return; }
      if (!recs || recs.length === 0) { setBusq({ estado: 'noexiste' }); return; }
      if (recs.length > 1) { setBusq({ estado: 'error', texto: `Hay más de una recepción con el N° ${n}.` }); return; }
      const rec = recs[0];
      const { data: activas, error: e2 } = await supabase
        .from('asignaciones')
        .select('id, id_estudiante, fecha_asignacion, estudiantes ( nombre_estudiante, codigo_estudiante )')
        .eq('id_recepcion', rec.id)
        .eq('activa', true)
        .order('fecha_asignacion');
      if (cancelado) return;
      if (e2) { setBusq({ estado: 'error', texto: e2.message }); return; }
      const titulares: Titular[] = (activas ?? []).map((a) => {
        const est = Array.isArray(a.estudiantes) ? a.estudiantes[0] : a.estudiantes;
        return {
          idAsignacion: a.id,
          idEstudiante: a.id_estudiante,
          nombre: est?.nombre_estudiante ?? '(sin nombre)',
          codigo: est?.codigo_estudiante ?? '',
          fecha: a.fecha_asignacion,
        };
      });
      setBusq({ estado: 'ok', recepcion: rec, titulares });
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
  }, [numero]);

  const titulares = busq.estado === 'ok' ? busq.titulares : [];
  const yaLaTiene = titulares.some((t) => t.idEstudiante === estudiante.id);
  const salienteEfectivo = titulares.length === 1 ? titulares[0].idEstudiante : saliente;

  async function ejecutar(accion: 'asignar' | 'reasignar') {
    if (busq.estado !== 'ok') return;
    if (!fecha) { setError('Escribe la fecha de asignación.'); return; }
    setGuardando(true);
    setError(null);
    const numeroAsesoria = busq.recepcion.asesoria_no;
    const obsNueva = observaciones.trim() || null;
    const resp =
      accion === 'asignar'
        ? await supabase.rpc('asignar_asesoria', {
            p_asesoria_no: numeroAsesoria,
            p_id_estudiante: estudiante.id,
            p_fecha: fecha,
            p_observaciones: obsNueva,
          })
        : await supabase.rpc('reasignar_asesoria', {
            p_asesoria_no: numeroAsesoria,
            p_id_estudiante_nuevo: estudiante.id,
            p_id_estudiante_saliente: salienteEfectivo,
            p_fecha: fecha,
            p_observaciones: motivo.trim(),
            p_observaciones_nueva: obsNueva,
          });
    let err = resp.error;
    // "Añadir" (asignar) se queda como asignación normal; solo la reasignación marca la nueva fila
    if (!err && accion === 'reasignar') {
      const { error: errMarca } = await supabase
        .from('asignaciones')
        .update({ es_reasignacion: true })
        .eq('id_recepcion', busq.recepcion.id)
        .eq('id_estudiante', estudiante.id)
        .eq('activa', true);
      err = errMarca;
    }
    setGuardando(false);
    if (err) { setError(err.message); return; }
    onHecho(
      accion === 'asignar'
        ? `Asesoría N° ${numeroAsesoria} asignada a ${estudiante.nombre_estudiante}.`
        : `Asesoría N° ${numeroAsesoria} reasignada a ${estudiante.nombre_estudiante}.`
    );
  }

  return (
    <div className="modal-overlay" onClick={() => !guardando && onCerrar()}>
      <div className="modal-card modal-card-ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-cuerpo">
          <h3>{paso === 'reasignar' ? 'Reasignar asesoría' : 'Asignar asesoría'}</h3>
          <p className="texto-secundario" style={{ marginTop: -8 }}>
            Estudiante: <strong>{estudiante.nombre_estudiante}</strong> ({estudiante.codigo_estudiante})
          </p>

          {paso === 'datos' && (
            <>
              <div className="field">
                <label htmlFor="asig-numero">N° de asesoría</label>
                <input
                  id="asig-numero"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  autoComplete="off"
                  value={numero}
                  onChange={(e) => {
                    setNumero(e.target.value);
                    setBusq({ estado: e.target.value.trim() ? 'buscando' : 'vacio' });
                    setError(null);
                  }}
                />
                {busq.estado === 'buscando' && <p className="asig-ayuda">Buscando...</p>}
                {busq.estado === 'noexiste' && <p className="asig-ayuda asig-ayuda-error">No existe una asesoría con el N° {numero.trim()}.</p>}
                {busq.estado === 'error' && <p className="asig-ayuda asig-ayuda-error">{busq.texto}</p>}
              </div>

              {busq.estado === 'ok' && (
                <div className="asig-datos-asesoria">
                  <div><span>Usuario</span><strong>{busq.recepcion.nombres_apellidos || '—'}</strong></div>
                  <div><span>Área</span><strong>{busq.recepcion.area_derecho || '—'}</strong></div>
                  <div className="largo"><span>Asunto</span><strong>{busq.recepcion.naturaleza_asunto || '—'}</strong></div>
                </div>
              )}

              <div className="field">
                <label htmlFor="asig-fecha">Fecha de asignación</label>
                <input id="asig-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="asig-obs">Observaciones (opcional)</label>
                <textarea
                  id="asig-obs"
                  className="asig-textarea"
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>

              {busq.estado === 'ok' && titulares.length > 0 && (
                <div className="asig-aviso">
                  {yaLaTiene ? (
                    <strong>Este estudiante ya tiene activa esta asesoría.</strong>
                  ) : (
                    <>
                      <strong>Esta asesoría ya está asignada a:</strong>
                      <ul>
                        {titulares.map((t) => (
                          <li key={t.idAsignacion}>
                            {t.nombre} <span>(desde {formatearFecha(t.fecha)})</span>
                          </li>
                        ))}
                      </ul>
                      <p>
                        <b>Añadir</b> la deja con varios estudiantes a la vez. <b>Reasignar</b> se la quita a {titulares.length === 1 ? 'ese estudiante' : 'uno de ellos'} y se la da a {estudiante.nombre_estudiante}.
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {paso === 'reasignar' && busq.estado === 'ok' && (
            <>
              <p className="texto-secundario" style={{ marginTop: 0 }}>
                Asesoría N° <strong>{busq.recepcion.asesoria_no}</strong> → pasa a <strong>{estudiante.nombre_estudiante}</strong>.
              </p>

              <div className="field">
                <label>{titulares.length === 1 ? 'Se le quita a' : 'Elige a quién se le quita'}</label>
                <div className="asig-opciones">
                  {titulares.map((t) => (
                    <label key={t.idAsignacion} className={`asig-opcion${salienteEfectivo === t.idEstudiante ? ' elegida' : ''}`}>
                      <input
                        type="radio"
                        name="saliente"
                        checked={salienteEfectivo === t.idEstudiante}
                        onChange={() => setSaliente(t.idEstudiante)}
                        disabled={titulares.length === 1}
                      />
                      <span>{t.nombre}</span>
                      <span className="asig-opcion-fecha">desde {formatearFecha(t.fecha)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="asig-motivo">Observación (obligatoria)</label>
                <textarea
                  id="asig-motivo"
                  className="asig-textarea"
                  rows={3}
                  autoFocus
                  placeholder="Por qué se le quita la asesoría..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <p className="asig-ayuda">Queda en la fila del estudiante que la pierde, que se conserva en rojo como historial.</p>
              </div>
            </>
          )}

          {error && <div className="form-message error" style={{ marginBottom: 0 }}>{error}</div>}
        </div>

        <div className="modal-acciones modal-acciones-compactas">
          {paso === 'datos' ? (
            <>
              <button className="btn-secundario" onClick={onCerrar} disabled={guardando}>Cancelar</button>
              {busq.estado === 'ok' && titulares.length > 0 && !yaLaTiene ? (
                <>
                  <button className="btn-secundario" onClick={() => { setError(null); setPaso('reasignar'); }} disabled={guardando}>
                    Reasignar
                  </button>
                  <button className="btn-primary" onClick={() => ejecutar('asignar')} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Añadir'}
                  </button>
                </>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => ejecutar('asignar')}
                  disabled={guardando || busq.estado !== 'ok' || yaLaTiene}
                >
                  {guardando ? 'Guardando...' : 'Asignar'}
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn-secundario" onClick={() => { setError(null); setPaso('datos'); }} disabled={guardando}>Volver</button>
              <button
                className="btn-primary"
                onClick={() => ejecutar('reasignar')}
                disabled={guardando || !salienteEfectivo || !motivo.trim()}
              >
                {guardando ? 'Guardando...' : 'Confirmar reasignación'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}