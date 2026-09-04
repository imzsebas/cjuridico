'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar

type Registro = {
  asesoria_no: string | null;
  fecha: string | null;
  nombres_apellidos: string | null;
  cedula_numero: string | null;
  area_derecho: string | null;
  direccion: string | null;
  contacto_1: string | null;
  correo: string | null;
  estudiante_recepciona_nombre: string | null;
  naturaleza_asunto: string | null;
  fecha_asignacion: string | null;
  nombre_estudiante: string | null;
  codigo_estudiante: string | null;
};

// Acepta "DD/MM/AAAA" y también "D/M/AA" (sin ceros a la izquierda, año corto)
function parsearFecha(fecha: string | null): { anio: number; periodo: 'I' | 'II' } | null {
  if (!fecha) return null;
  const partes = fecha.trim().split('/');
  if (partes.length !== 3) return null;
  const mes = parseInt(partes[1], 10);
  let anio = parseInt(partes[2], 10);
  if (Number.isNaN(mes) || Number.isNaN(anio) || mes < 1 || mes > 12) return null;
  if (partes[2].length <= 2) anio += 2000;
  return { anio, periodo: mes <= 6 ? 'I' : 'II' };
}

const dato = (v: string | null) => v || <span className="sin-dato">—</span>;

export default function LibroAsesoriasPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Controla qué filas tienen el detalle abierto. La clave combina el grupo
  // (año-periodo) con el número de asesoría, para que sea única en toda la página.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function alternarDetalle(id: string) {
    setExpandidos((prev) => {
      const nuevo = new Set(prev);
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
      return nuevo;
    });
  }

  // Solo administradores
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

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      const { data, error } = await supabase
        .from('libro_asesorias')
        .select('*')
        .order('asesoria_no', { ascending: false });
      if (cancelado) return;
      if (error) setError(error.message);
      else setRegistros(data ?? []);
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, []);

  // Agrupar por año -> periodo (los sin fecha válida quedan aparte)
  const grupos = new Map<number, Map<'I' | 'II', Registro[]>>();
  const sinFecha: Registro[] = [];

  for (const registro of registros) {
    const info = parsearFecha(registro.fecha);
    if (!info) { sinFecha.push(registro); continue; }
    if (!grupos.has(info.anio)) grupos.set(info.anio, new Map());
    const porPeriodo = grupos.get(info.anio)!;
    if (!porPeriodo.has(info.periodo)) porPeriodo.set(info.periodo, []);
    porPeriodo.get(info.periodo)!.push(registro);
  }

  const anios = [...grupos.keys()].sort((a, b) => b - a);

  // Solo 5 columnas esenciales quedan siempre visibles. El resto (documento,
  // dirección, teléfono, correo, monitor, asunto, fecha de reparto, código)
  // se movió a un detalle expandible por fila: así se acaba el scroll
  // horizontal para lo que la mayoría de personas necesita ver a diario.
  function tabla(lista: Registro[], grupoKey: string) {
    return (
      <div className="admin-table-card" key={grupoKey}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>N° asesoría</th>
              <th>Nombre del usuario</th>
              <th>Fecha</th>
              <th>Área</th>
              <th>Estudiante asignado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, i) => {
              const id = `${grupoKey}-${r.asesoria_no ?? i}`;
              const abierto = expandidos.has(id);
              return (
                <Fragment key={id}>
                  <tr className={`fila-con-detalle${abierto ? ' fila-expandida' : ''}`}>
                    <td>{dato(r.asesoria_no)}</td>
                    <td>{dato(r.nombres_apellidos)}</td>
                    <td>{dato(r.fecha)}</td>
                    <td>{dato(r.area_derecho)}</td>
                    <td>{dato(r.nombre_estudiante)}</td>
                    <td>
                      <button
                        type="button"
                        className={`btn-expandir${abierto ? ' abierto' : ''}`}
                        onClick={() => alternarDetalle(id)}
                        title={abierto ? 'Ocultar detalle' : 'Ver detalle completo'}
                        aria-expanded={abierto}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="fila-detalle">
                      <td colSpan={6}>
                        <dl className="detalle-grid">
                          <div>
                            <dt>Número de documento</dt>
                            <dd>{dato(r.cedula_numero)}</dd>
                          </div>
                          <div>
                            <dt>Dirección</dt>
                            <dd>{dato(r.direccion)}</dd>
                          </div>
                          <div>
                            <dt>Teléfono</dt>
                            <dd>{dato(r.contacto_1)}</dd>
                          </div>
                          <div>
                            <dt>Correo</dt>
                            <dd>{dato(r.correo)}</dd>
                          </div>
                          <div>
                            <dt>Monitor encargado</dt>
                            <dd>{dato(r.estudiante_recepciona_nombre)}</dd>
                          </div>
                          <div>
                            <dt>Asunto</dt>
                            <dd>{dato(r.naturaleza_asunto)}</dd>
                          </div>
                          <div>
                            <dt>Fecha del reparto</dt>
                            <dd>{dato(r.fecha_asignacion)}</dd>
                          </div>
                          <div>
                            <dt>Código del estudiante</dt>
                            <dd>{dato(r.codigo_estudiante)}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Libro de asesorías</h2>
        <p>Historial completo de asesorías, organizado por año y periodo.</p>
      </div>

      {error && <div className="form-message error" style={{ maxWidth: 1600, margin: '0 auto 16px' }}>{error}</div>}
      {cargando && <p className="admin-estado-cargando">Cargando...</p>}
      {!cargando && registros.length === 0 && !error && (
        <p className="admin-estado-vacio">Todavía no hay asesorías registradas.</p>
      )}

      {anios.map((anio) => {
        const porPeriodo = grupos.get(anio)!;
        const periodos = (['II', 'I'] as const).filter((p) => porPeriodo.has(p));
        return (
          <div key={anio} className="libro-grupo-anio">
            <h3 className="libro-anio">{anio}</h3>
            {periodos.map((periodo) => (
              <div key={periodo} className="libro-periodo-bloque">
                <p className="libro-periodo-titulo">
                  Periodo {anio}-{periodo}
                </p>
                {tabla(porPeriodo.get(periodo)!, `${anio}-${periodo}`)}
              </div>
            ))}
          </div>
        );
      })}

      {sinFecha.length > 0 && (
        <div className="libro-grupo-anio">
          <h3 className="libro-anio">Sin fecha reconocible</h3>
          {tabla(sinFecha, 'sin-fecha')}
        </div>
      )}
    </div>
  );
}