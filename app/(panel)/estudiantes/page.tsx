'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar

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

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from('estudiantes').select('*').order('nombre_estudiante');
    if (error) setError(error.message);
    else setEstudiantes(data ?? []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  const estudiantesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return estudiantes.filter((e) => {
      const coincideNombre = termino === '' || e.nombre_estudiante.toLowerCase().includes(termino);
      const coincideNivel = filtroNivel === 'TODOS' || e.nivel_consultorio === filtroNivel;
      return coincideNombre && coincideNivel;
    });
  }, [estudiantes, busqueda, filtroNivel]);

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
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este estudiante del directorio?')) return;
    const { error } = await supabase.from('estudiantes').delete().eq('id', id);
    if (error) setError(error.message);
    else cargar();
  }

  return (
    <>
    <div className="admin-page">
      <div className="admin-header">
        <h2>Estudiantes</h2>
        <p>Directorio de estudiantes del consultorio.</p>
      </div>

      {error && <div className="form-message error" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{error}</div>}

      <div style={{ maxWidth: 1600, margin: '0 auto 16px' }}>
        <button className="btn-chip" onClick={() => setModal({ id: null, datos: { ...VACIO } })}>
          + Nuevo estudiante
        </button>
      </div>

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
          onChange={(e) => setFiltroNivel(e.target.value)}
        >
          <option value="TODOS">Todos los niveles</option>
          {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {!cargando && (
          <span className="admin-contador">
            {estudiantesFiltrados.length} de {estudiantes.length} estudiantes
          </span>
        )}
      </div>

      {cargando && <p className="admin-estado-cargando">Cargando...</p>}
      {!cargando && estudiantes.length === 0 && (
        <p className="admin-estado-vacio">Todavía no hay estudiantes registrados.</p>
      )}
      {!cargando && estudiantes.length > 0 && estudiantesFiltrados.length === 0 && (
        <p className="admin-estado-vacio">No se encontraron estudiantes con ese criterio.</p>
      )}

      {!cargando && estudiantesFiltrados.length > 0 && (
        <div className="admin-table-card">
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
              {estudiantesFiltrados.map((e) => (
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