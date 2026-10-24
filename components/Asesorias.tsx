'use client';

// Piezas de pantalla que comparten "Libro de asesorías" y "Mis recepciones".

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Filtros, Registro, periodoDe } from '@/lib/asesorias';
import { AREAS_DERECHO, repartoDe, resumenCaso } from '@/lib/estructuraRecepcion';

const dato = (v: string | null) => v || <span className="sin-dato">—</span>;

// Botón "Exportar" del encabezado
export function BotonExportar({ onClick, deshabilitado, exportando, title }: {
  onClick: () => void; deshabilitado: boolean; exportando: boolean; title: string;
}) {
  return (
    <button type="button" className="cp-add-btn" onClick={onClick} disabled={deshabilitado} title={title}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <polyline points="7 10 12 15 17 10" />
        <path d="M4 19h16" />
      </svg>
      {exportando ? 'Exportando…' : 'Exportar'}
    </button>
  );
}

// Tabla de asesorías: cada fila abre el detalle
export function TablaAsesorias({ registros, cargando, onAbrir }: {
  registros: Registro[]; cargando: boolean; onAbrir: (r: Registro) => void;
}) {
  if (registros.length === 0) return null;
  return (
    <div className="admin-table-card" style={{ opacity: cargando ? 0.6 : 1 }}>
      <table className="admin-table admin-table-compacta">
        <thead>
          <tr>
            <th>N° asesoría</th>
            <th>Periodo</th>
            <th>Nombre del usuario</th>
            <th>Fecha</th>
            <th>Área</th>
            <th>Estudiante asignado</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr
              key={r.id_recepcion ?? `${r.asesoria_no ?? 'sin-numero'}-${i}`}
              className="fila-clic"
              tabIndex={0}
              onClick={() => onAbrir(r)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(r); }}
            >
              <td>{dato(r.asesoria_no)}</td>
              <td>{dato(periodoDe(r.fecha))}</td>
              <td>{dato(r.nombres_apellidos)}</td>
              <td>{dato(r.fecha)}</td>
              <td>{dato(r.area_derecho)}</td>
              <td>{dato(r.nombre_estudiante)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Toda la información de una asesoría (fila completa de "recepciones"), pedida solo cuando se abre el detalle.
// `version` sirve para volver a pedirla después de editar.
export function useCaso(id: string | null | undefined, version = 0) {
  const clave = id ? `${id}|${version}` : null;
  const [caso, setCaso] = useState<{ clave: string; fila: Record<string, unknown> | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!clave || !id) return;
    let cancelado = false;
    supabase.from('recepciones').select('*').eq('id', id).single().then(({ data, error }) => {
      if (cancelado) return;
      setCaso({
        clave,
        fila: data ?? null,
        error: error || !data ? (error?.message ?? 'No se encontró la información del caso.') : null,
      });
    });
    return () => { cancelado = true; };
  }, [clave, id]);

  const actual = clave && caso?.clave === clave ? caso : null;
  return { fila: actual?.fila ?? null, error: actual?.error ?? null, cargando: !!clave && !actual };
}

// Cuerpo del modal de detalle: resumen arriba y las 6 secciones del formulario
export function DetalleAsesoria({ registro, caso }: { registro: Registro; caso: ReturnType<typeof useCaso> }) {
  const secciones = useMemo(() => (caso.fila ? resumenCaso(caso.fila) : null), [caso.fila]);
  const reparto = caso.fila ? repartoDe(caso.fila.detalles) : null;

  return (
    <>
      <div className="caso-resumen">
        <div><span>Usuario</span><strong>{registro.nombres_apellidos || '—'}</strong></div>
        <div><span>Fecha</span><strong>{registro.fecha || '—'}</strong></div>
        <div>
          <span>Estudiante asignado</span>
          <strong>
            {registro.nombre_estudiante
              ? `${registro.nombre_estudiante}${registro.codigo_estudiante ? ` (${registro.codigo_estudiante})` : ''}`
              : 'Sin asignar'}
          </strong>
        </div>
        <div><span>Fecha del reparto</span><strong>{registro.fecha_asignacion || '—'}</strong></div>
        <div><span>Reparto</span><strong>{reparto ?? '—'}</strong></div>
      </div>

      {caso.error ? (
        <div className="form-message error">{caso.error}</div>
      ) : caso.cargando ? (
        <p className="admin-estado-cargando" style={{ margin: 0 }}>Cargando información del caso...</p>
      ) : (
        secciones?.map((sec, i) => (
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
    </>
  );
}

// Encabezado del modal: "Asesoría N° 123"
export function TituloAsesoria({ children }: { children: ReactNode }) {
  return <div className="caso-encabezado"><h3>{children}</h3></div>;
}

// Barra de búsqueda y filtros. El texto se aplica un instante después de dejar de escribir.
export function FiltrosAsesorias({ filtros, onCambiar, total, cargando }: {
  filtros: Filtros; onCambiar: (f: Filtros) => void; total: number; cargando: boolean;
}) {
  const [texto, setTexto] = useState(filtros.texto);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const actual = useRef(filtros);
  useEffect(() => { actual.current = filtros; });

  useEffect(() => {
    const espera = setTimeout(() => {
      if (texto.trim() !== actual.current.texto) onCambiar({ ...actual.current, texto: texto.trim() });
    }, 300);
    return () => clearTimeout(espera);
  }, [texto, onCambiar]);

  // Periodos que tienen asesorías (para el monitor, solo los de sus recepciones)
  useEffect(() => {
    let cancelado = false;
    supabase.rpc('periodos_asesorias').then(({ data }) => {
      if (!cancelado && Array.isArray(data)) setPeriodos(data as string[]);
    });
    return () => { cancelado = true; };
  }, []);

  return (
    <div className="admin-toolbar">
      <input
        type="text"
        className="admin-input-busqueda"
        placeholder="Buscar por N.º de asesoría, nombre o cédula..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <select className="admin-select-filtro" value={filtros.area} onChange={(e) => onCambiar({ ...filtros, area: e.target.value })}>
        <option value="">Todas las áreas</option>
        {AREAS_DERECHO.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <select className="admin-select-filtro" value={filtros.periodo} onChange={(e) => onCambiar({ ...filtros, periodo: e.target.value })}>
        <option value="">Todos los periodos</option>
        {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {!cargando && <span className="admin-contador">{total} {total === 1 ? 'asesoría' : 'asesorías'}</span>}
    </div>
  );
}
