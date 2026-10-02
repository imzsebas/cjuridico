'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';

const NIVELES = ['DERECHO PUBLICO', 'DERECHO PRIVADO', 'DERECHO LABORAL', 'DERECHO PENAL'] as const;

type Estudiante = {
  id: string;
  nombre_estudiante: string;
  codigo_estudiante: string;
  telefono_estudiante: string | null;
  correo_estudiante: string | null;
  nivel_consultorio: string;
};

const VACIO = {
  nombre_estudiante: '', codigo_estudiante: '', telefono_estudiante: '',
  correo_estudiante: '', nivel_consultorio: NIVELES[0] as string,
};

export default function EstudiantesPage() {
  const router = useRouter();
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ id: string | null; datos: typeof VACIO } | null>(null);
  const [guardando, setGuardando] = useState(false);

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
    else setRecarga((n) => n + 1);
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
          {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
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
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Nivel de consultorio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((e) => (
                <tr key={e.id}>
                  <td>{e.nombre_estudiante}</td>
                  <td>{e.codigo_estudiante}</td>
                  <td>{e.telefono_estudiante || <span className="sin-dato">—</span>}</td>
                  <td>{e.correo_estudiante || <span className="sin-dato">—</span>}</td>
                  <td>{e.nivel_consultorio}</td>
                  <td>
                    <div className="admin-acciones">
                      <button
                        className="btn-chip"
                        onClick={() => setModal({
                          id: e.id,
                          datos: {
                            nombre_estudiante: e.nombre_estudiante,
                            codigo_estudiante: e.codigo_estudiante,
                            telefono_estudiante: e.telefono_estudiante ?? '',
                            correo_estudiante: e.correo_estudiante ?? '',
                            nivel_consultorio: e.nivel_consultorio,
                          },
                        })}
                      >
                        Editar
                      </button>
                      <button className="btn-chip" onClick={() => eliminar(e.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />
      </div>
    </div>

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
                {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="modal-acciones">
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