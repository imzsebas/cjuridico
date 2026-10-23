'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import PanelTopbar from '@/components/PanelTopbar';
import { NIVELES, etiquetaNivel } from '@/lib/niveles';
import { DIAS, TURNOS, etiquetaTurno, momentoActual, nombreDia, textoSiguienteTurno } from '@/lib/turnos';

// Calendario semanal: quién está en el consultorio en cada turno (lunes a viernes).
// El administrador toca un recuadro para asignar varios estudiantes a la vez.

type Fila = {
  id_estudiante: string;
  dia: number;
  turno: number;
  estudiantes: { nombre_estudiante: string; nivel_consultorio: string } | { nombre_estudiante: string; nivel_consultorio: string }[] | null;
};

type Persona = { id: string; nombre: string; nivel: string };
type EstudianteLista = { id: string; nombre_estudiante: string };

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Modal: lista de estudiantes para asignar a un turno
// ---------------------------------------------------------------------------
function ModalTurno({
  dia, turno, actuales, onCerrar, onGuardado,
}: {
  dia: number;
  turno: number;
  actuales: Set<string>;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [estudiantes, setEstudiantes] = useState<EstudianteLista[] | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(actuales));
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Todos los estudiantes, en bloques de 1000
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const TAM = 1000;
      const todos: EstudianteLista[] = [];
      for (let ini = 0; ; ini += TAM) {
        const { data, error } = await supabase
          .from('estudiantes')
          .select('id, nombre_estudiante')
          .order('nombre_estudiante')
          .order('id')
          .range(ini, ini + TAM - 1);
        if (cancelado) return;
        if (error) { setError(error.message); setEstudiantes([]); return; }
        todos.push(...(data ?? []));
        if ((data?.length ?? 0) < TAM) break;
      }
      setEstudiantes(todos);
    }
    cargar();
    return () => { cancelado = true; };
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return (estudiantes ?? []).filter((e) => !q || normalizar(e.nombre_estudiante).includes(q));
  }, [estudiantes, busqueda]);

  function alternar(id: string) {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id); else copia.add(id);
      return copia;
    });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const agregar = [...seleccion].filter((id) => !actuales.has(id));
    const quitar = [...actuales].filter((id) => !seleccion.has(id));

    if (agregar.length > 0) {
      const { error } = await supabase
        .from('horarios_estudiantes')
        .insert(agregar.map((id) => ({ id_estudiante: id, dia, turno })));
      if (error) { setError(error.message); setGuardando(false); return; }
    }
    if (quitar.length > 0) {
      const { error } = await supabase
        .from('horarios_estudiantes')
        .delete()
        .eq('dia', dia)
        .eq('turno', turno)
        .in('id_estudiante', quitar);
      if (error) { setError(error.message); setGuardando(false); return; }
    }
    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-cuerpo">
          <h3>{nombreDia(dia)} · Turno {turno}</h3>
          <p className="texto-secundario" style={{ margin: '-6px 0 14px' }}>{etiquetaTurno(turno)}</p>

          <input
            type="text"
            className="admin-input-busqueda"
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="Buscar estudiante por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
          />

          {error && <div className="form-message error" style={{ marginBottom: 10 }}>{error}</div>}

          {estudiantes === null ? (
            <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando estudiantes...</p>
          ) : visibles.length === 0 ? (
            <p className="admin-estado-vacio" style={{ margin: 0 }}>No se encontraron estudiantes.</p>
          ) : (
            <div className="sel-lista">
              {visibles.map((e) => (
                <label key={e.id} className="sel-item">
                  <input type="checkbox" checked={seleccion.has(e.id)} onChange={() => alternar(e.id)} />
                  <span className="chk-caja" />
                  <span>{e.nombre_estudiante}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="modal-acciones modal-acciones-compactas">
          <button className="btn-secundario" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando || estudiantes === null}>
            {guardando ? 'Guardando...' : 'Guardar turnos'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function CalendarioPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [nivel, setNivel] = useState('');
  const [ahora, setAhora] = useState(() => new Date());
  const [recarga, setRecarga] = useState(0);
  const [celdaModal, setCeldaModal] = useState<{ dia: number; turno: number } | null>(null);

  // Reloj: se actualiza cada minuto para resaltar el turno en curso
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Pueden entrar el administrador y los monitores (solo el administrador edita)
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (!perfil || !['administrador', 'monitor'].includes(perfil.rol)) { router.replace('/login'); return; }
      setEsAdmin(perfil.rol === 'administrador');
      setAutorizado(true);
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // Todos los horarios, en bloques de 1000
  useEffect(() => {
    if (!autorizado) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      const TAM = 1000;
      const todas: Fila[] = [];
      for (let ini = 0; ; ini += TAM) {
        const { data, error } = await supabase
          .from('horarios_estudiantes')
          .select('id_estudiante, dia, turno, estudiantes ( nombre_estudiante, nivel_consultorio )')
          .order('id')
          .range(ini, ini + TAM - 1);
        if (cancelado) return;
        if (error) { setError(error.message); setCargando(false); return; }
        todas.push(...((data ?? []) as unknown as Fila[]));
        if ((data?.length ?? 0) < TAM) break;
      }
      setFilas(todas);
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [autorizado, recarga]);

  // Personas de cada celda (día-turno), con los filtros aplicados y en orden alfabético
  const celdas = useMemo(() => {
    const q = normalizar(busqueda);
    const mapa = new Map<string, Persona[]>();
    filas.forEach((f) => {
      const est = Array.isArray(f.estudiantes) ? f.estudiantes[0] : f.estudiantes;
      if (!est) return;
      if (nivel && est.nivel_consultorio !== nivel) return;
      if (q && !normalizar(est.nombre_estudiante).includes(q)) return;
      const clave = `${f.dia}-${f.turno}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push({ id: f.id_estudiante, nombre: est.nombre_estudiante, nivel: est.nivel_consultorio });
    });
    mapa.forEach((lista) => lista.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return mapa;
  }, [filas, busqueda, nivel]);

  const estudiantesConHorario = useMemo(() => new Set(filas.map((f) => f.id_estudiante)).size, [filas]);
  const momento = momentoActual(ahora);
  const enTurno = momento.turno ? (celdas.get(`${momento.dia}-${momento.turno}`) ?? []).length : 0;

  // Ids asignados a la celda abierta, sin aplicar los filtros de la página
  const actualesModal = useMemo(() => {
    if (!celdaModal) return new Set<string>();
    return new Set(
      filas.filter((f) => f.dia === celdaModal.dia && f.turno === celdaModal.turno).map((f) => f.id_estudiante)
    );
  }, [filas, celdaModal]);

  return (
    <div className="cp-wrap">
      <PanelTopbar title="Calendario" subtitle={`${estudiantesConHorario} estudiantes con horario · Turnos del consultorio de lunes a viernes`} />
      <div className="cp-content">
        {error && <div className="form-message error" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{error}</div>}

        <div className="cal-banner">
          {momento.turno ? (
            <>
              <span className="punto-turno" />
              <span>
                <strong>Ahora:</strong> {nombreDia(momento.dia)}, turno {momento.turno} ({etiquetaTurno(momento.turno)}) ·{' '}
                <strong>{enTurno}</strong> {enTurno === 1 ? 'estudiante en turno' : 'estudiantes en turno'}
              </span>
            </>
          ) : (
            <>
              <span className="punto-turno apagado" />
              <span>
                <strong>No hay turno en este momento.</strong> El próximo es {textoSiguienteTurno(ahora)}.
              </span>
            </>
          )}
        </div>

        <div className="admin-toolbar">
          <input
            type="text"
            className="admin-input-busqueda"
            placeholder="Buscar estudiante por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="admin-select-filtro" value={nivel} onChange={(e) => setNivel(e.target.value)}>
            <option value="">Todos los niveles</option>
            {NIVELES.map((n) => <option key={n} value={n}>{etiquetaNivel(n)}</option>)}
          </select>
        </div>

        {cargando && filas.length === 0 ? (
          <p className="admin-estado-cargando">Cargando calendario...</p>
        ) : (
          <div className="cal-scroll" style={{ opacity: cargando ? 0.6 : 1 }}>
            <table className="cal-tabla">
              <thead>
                <tr>
                  <th className="cal-esquina">Turno</th>
                  {DIAS.map((d) => (
                    <th key={d.id} className={momento.dia === d.id ? 'cal-hoy' : undefined}>
                      {d.nombre}
                      {momento.dia === d.id && <span className="cal-hoy-etiqueta">hoy</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TURNOS.map((t) => (
                  <tr key={t.id}>
                    <th className="cal-turno" scope="row">
                      <strong>Turno {t.id}</strong>
                      <span>{t.etiqueta}</span>
                    </th>
                    {DIAS.map((d) => {
                      const lista = celdas.get(`${d.id}-${t.id}`) ?? [];
                      const enCurso = momento.dia === d.id && momento.turno === t.id;
                      const abrir = () => setCeldaModal({ dia: d.id, turno: t.id });
                      return (
                        <td
                          key={d.id}
                          className={`cal-celda${enCurso ? ' cal-celda-ahora' : ''}${esAdmin ? ' cal-celda-editable' : ''}`}
                          {...(esAdmin
                            ? {
                                role: 'button',
                                tabIndex: 0,
                                'aria-label': `Asignar estudiantes: ${d.nombre}, turno ${t.id}`,
                                onClick: abrir,
                                onKeyDown: (ev: React.KeyboardEvent) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
                                },
                              }
                            : {})}
                        >
                          {lista.length > 0 && (
                            <ul className="cal-lista">
                              {lista.map((p) => <li key={p.id}>{p.nombre}</li>)}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {celdaModal && (
        <ModalTurno
          key={`${celdaModal.dia}-${celdaModal.turno}`}
          dia={celdaModal.dia}
          turno={celdaModal.turno}
          actuales={actualesModal}
          onCerrar={() => setCeldaModal(null)}
          onGuardado={() => { setCeldaModal(null); setRecarga((n) => n + 1); }}
        />
      )}
    </div>
  );
}