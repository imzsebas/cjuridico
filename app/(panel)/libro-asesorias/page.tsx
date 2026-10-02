'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import Paginacion, { POR_PAGINA } from '@/components/Paginacion';
import { descargarArchivo, generarPdfRecepcion, valoresDesdeFila } from '@/lib/formatoRecepcion';
import { SeccionCaso, repartoDe, resumenCaso } from '@/lib/estructuraRecepcion';

type Registro = {
  id_recepcion: string | null;
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
  pdf_url: string | null;
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

function mensajeDe(e: unknown, porDefecto: string) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return porDefecto;
}

export default function LibroAsesoriasPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal grande con toda la información de la asesoría (se abre al tocar una fila)
  const [detalle, setDetalle] = useState<Registro | null>(null);
  const [datosCaso, setDatosCaso] = useState<SeccionCaso[] | null>(null);
  const [reparto, setReparto] = useState<'Sí' | 'No' | null>(null);
  const [errorCaso, setErrorCaso] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  // Paginación: se pide a la base de datos solo la página actual (15 asesorías)
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);

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
      setCargando(true);
      const desde = (pagina - 1) * POR_PAGINA;
      const { data, error, count } = await supabase
        .from('libro_asesorias')
        .select('*', { count: 'exact' })
        .order('asesoria_no', { ascending: false })
        .order('id_recepcion')
        .range(desde, desde + POR_PAGINA - 1);
      if (cancelado) return;
      if (error) setError(error.message);
      else {
        setRegistros(data ?? []);
        setTotal(count ?? 0);
      }
      setCargando(false);
    }
    cargar();
    return () => { cancelado = true; };
  }, [pagina]);

  // Información completa de la asesoría: se pide solo cuando se abre el modal
  useEffect(() => {
    if (!detalle) return;
    let cancelado = false;
    async function cargarCaso(id: string | null) {
      setDatosCaso(null);
      setReparto(null);
      setErrorCaso(null);
      setErrorDescarga(null);
      if (!id) {
        setDatosCaso([]);
        return;
      }
      const { data, error } = await supabase.from('recepciones').select('*').eq('id', id).single();
      if (cancelado) return;
      if (error || !data) {
        setErrorCaso(error?.message ?? 'No se encontró la información del caso.');
        return;
      }
      setDatosCaso(resumenCaso(data));
      setReparto(repartoDe(data.detalles));
    }
    cargarCaso(detalle.id_recepcion);
    return () => { cancelado = true; };
  }, [detalle]);

  // Vuelve a llenar el formato PDF con los datos que hay hoy en la base de datos
  async function descargarFormato(r: Registro) {
    if (!r.id_recepcion) return;
    setGenerando(true);
    setErrorDescarga(null);
    try {
      const { data, error } = await supabase.from('recepciones').select('*').eq('id', r.id_recepcion).single();
      if (error) throw error;
      const bytes = await generarPdfRecepcion(valoresDesdeFila(data));
      descargarArchivo(bytes, `formato-recepcion-${r.asesoria_no ?? 'sin-numero'}.pdf`);
    } catch (e) {
      setErrorDescarga(mensajeDe(e, 'No se pudo generar el formato.'));
    } finally {
      setGenerando(false);
    }
  }

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

  // La tabla solo muestra lo esencial. Al tocar una fila se abre el modal con todo el detalle.
  function tabla(lista: Registro[], grupoKey: string) {
    return (
      <div className="admin-table-card" key={grupoKey}>
        <table className="admin-table admin-table-compacta">
          <thead>
            <tr>
              <th>N° asesoría</th>
              <th>Nombre del usuario</th>
              <th>Fecha</th>
              <th>Área</th>
              <th>Estudiante asignado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, i) => (
              <tr
                key={`${grupoKey}-${r.asesoria_no ?? i}`}
                className="fila-clic"
                tabIndex={0}
                onClick={() => setDetalle(r)}
                onKeyDown={(e) => { if (e.key === 'Enter') setDetalle(r); }}
              >
                <td>{dato(r.asesoria_no)}</td>
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

  return (
    <div className="cp-wrap">
      <PanelTopbar title="Libro de asesorías" subtitle="Historial completo de asesorías, organizado por año y periodo." />
      <div className="cp-content">

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

      <Paginacion pagina={pagina} total={total} onCambiar={setPagina} />
      </div>

      {/* Modal grande: toda la información de la asesoría */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal-card modal-card-grande" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card-cuerpo">
              <div className="caso-encabezado">
                <h3>Asesoría N° {detalle.asesoria_no || 'sin número'}</h3>
              </div>
              <div className="caso-resumen">
                <div><span>Usuario</span><strong>{detalle.nombres_apellidos || '—'}</strong></div>
                <div><span>Fecha</span><strong>{detalle.fecha || '—'}</strong></div>
                <div>
                  <span>Estudiante asignado</span>
                  <strong>
                    {detalle.nombre_estudiante
                      ? `${detalle.nombre_estudiante}${detalle.codigo_estudiante ? ` (${detalle.codigo_estudiante})` : ''}`
                      : 'Sin asignar'}
                  </strong>
                </div>
                <div><span>Fecha del reparto</span><strong>{detalle.fecha_asignacion || '—'}</strong></div>
                <div><span>Reparto</span><strong>{reparto ?? '—'}</strong></div>
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
              {errorDescarga && <div className="form-message error">{errorDescarga}</div>}
            </div>

            <div className="modal-acciones">
              <button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>
              {detalle.pdf_url && (
                <a
                  className="btn-secundario"
                  href={detalle.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  title="El PDF tal como se guardó cuando se hizo la recepción"
                >
                  Descargar PDF guardado
                </a>
              )}
              <button
                className="btn-primary"
                onClick={() => descargarFormato(detalle)}
                disabled={!detalle.id_recepcion || generando}
                title="Vuelve a llenar el formato con los datos que hay hoy en el sistema"
              >
                {generando ? 'Generando...' : 'Descargar PDF con datos actuales'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}