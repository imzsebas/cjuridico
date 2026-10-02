'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import {
  Casilla, Fila, FormProvider, GrupoUnico, Lista, Seccion, SiNo, Texto, useFormulario,
} from '@/components/recepcion/Controles';
import {
  CAMPOS_INDIVIDUALES, Medidor, Valores, crearMedidor, descargarArchivo,
  generarPdfRecepcion, partirEnLineas,
} from '@/lib/formatoRecepcion';
import {
  AREAS_DERECHO, ASESORIA_REPARTO, COMO_NOS_CONOCIO, DISCAPACIDADES, DOCUMENTOS, ESCOLARIDAD,
  ESTADO_CIVIL, HECHOS, OCUPACION, POBLACION, SECCIONES, SIN_SELECCION, SIN_TEXTO,
  TIPO_IDENTIFICACION, completarEnBlanco, revisarFormulario,
} from '@/lib/estructuraRecepcion';

const ULTIMO_PASO = SECCIONES.length - 1;

const aInputFecha = (f: string) => {
  const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const deInputFecha = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

function valoresIniciales(): Valores {
  const ahora = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return {
    fecha: `${dos(ahora.getDate())}/${dos(ahora.getMonth() + 1)}/${ahora.getFullYear()}`,
    hora_recepcion: `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`,
  };
}

// Un hecho de la síntesis: cuadro de texto + aviso si no cabe en las 3 líneas del formato
function Hecho({ n, medidor }: { n: number; medidor: Medidor | null }) {
  const { valores, set } = useFormulario();
  const k = `sintesis_hecho_${n}`;
  const texto = valores[k] ?? '';
  const { lineas, desborde } = medidor ? partirEnLineas(texto, medidor) : { lineas: [], desborde: false };
  return (
    <div className="rf-campo rf-hecho">
      <label htmlFor={`rf-${k}`}>Hecho {n}</label>
      <textarea
        id={`rf-${k}`}
        rows={3}
        value={texto}
        onChange={(e) => set(k, e.target.value)}
      />
      {medidor && texto.trim() !== '' && (
        <div className={`rf-contador${desborde ? ' excede' : ''}`}>
          {desborde
            ? 'No cabe en el espacio del formato: acorta el texto para poder guardar.'
            : `${lineas.length} de 3 líneas del formato`}
        </div>
      )}
    </div>
  );
}

export default function RecepcionPage() {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>({});
  const [medidor, setMedidor] = useState<Medidor | null>(null);
  const [paso, setPaso] = useState(0);
  const [aviso, setAviso] = useState(false); // ventana de "hay espacios sin llenar"
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(null);
  const [guardado, setGuardado] = useState<{ numero: number; bytes: Uint8Array; nombreArchivo: string } | null>(null);

  const set = useCallback((k: string, v: string) => setValores((p) => ({ ...p, [k]: v })), []);
  const setVarios = useCallback((c: Valores) => setValores((p) => ({ ...p, ...c })), []);
  const contexto = useMemo(() => ({ valores, set, setVarios }), [valores, set, setVarios]);

  // Espacios en blanco de cada sección (sirve para el check de los pasos y para la advertencia)
  const faltantes: string[][] = useMemo(() => revisarFormulario(valores), [valores]);
  const totalFaltantes = faltantes.reduce((suma: number, lista: string[]) => suma + lista.length, 0);

  // Solo monitores o administradores pueden entrar aquí
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (!perfil || !['monitor', 'administrador'].includes(perfil.rol)) router.replace('/login');
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // Fecha y hora actuales por defecto + medidor de texto (misma fuente del PDF)
  useEffect(() => {
    // Se llena después del primer render para que la hora sea la del navegador del monitor
    const arranque = setTimeout(() => setValores((p) => ({ ...valoresIniciales(), ...p })), 0);
    let cancelado = false;
    crearMedidor().then((m) => { if (!cancelado) setMedidor(() => m); });
    return () => { cancelado = true; clearTimeout(arranque); };
  }, []);

  function irAPaso(n: number) {
    setPaso(Math.min(Math.max(n, 0), ULTIMO_PASO));
    document.querySelector('.cp-content')?.scrollTo({ top: 0 });
  }

  function nuevoFormulario() {
    setValores(valoresIniciales());
    setGuardado(null);
    setMensaje(null);
    setAviso(false);
    irAPaso(0);
  }

  // Botón "Guardar y descargar PDF": primero revisa lo obligatorio y luego avisa de los espacios en blanco
  function solicitarGuardado() {
    setMensaje(null);

    const obligatorios: { k: string; texto: string; paso: number }[] = [
      { k: 'nombres_apellidos', texto: 'el nombre del usuario (sección 1)', paso: 0 },
      { k: 'estudiante_recepciona_nombre', texto: 'el nombre del estudiante que recepciona (sección 6)', paso: ULTIMO_PASO },
    ];
    const sinLlenar = obligatorios.filter((o) => !valores[o.k]?.trim());
    if (sinLlenar.length) {
      setMensaje({ tipo: 'error', texto: `Falta completar ${sinLlenar.map((o) => o.texto).join(' y ')}.` });
      irAPaso(sinLlenar[0].paso);
      return;
    }

    if (totalFaltantes > 0) {
      setAviso(true);
      return;
    }
    guardar(valores);
  }

  // El usuario decidió descargar aunque haya espacios sin llenar
  function descargarDeTodasFormas() {
    const completo = completarEnBlanco(valores);
    setValores(completo);
    guardar(completo);
  }

  async function guardar(base: Valores) {
    setMensaje(null);
    setGuardando(true);
    try {
      const medir = medidor ?? (await crearMedidor());
      for (const n of HECHOS) {
        if (partirEnLineas(base[`sintesis_hecho_${n}`] ?? '', medir).desborde) {
          irAPaso(ULTIMO_PASO);
          throw new Error(`El hecho ${n} no cabe en el espacio del formato. Acórtalo para poder guardar.`);
        }
      }

      // 1. Pedir el siguiente número de asesoría de forma atómica en la BD
      const { data: numero, error: errorNumero } = await supabase.rpc('siguiente_numero_asesoria');
      if (errorNumero) throw errorNumero;

      // Solo se guardan los campos con contenido
      const finales: Valores = {};
      for (const [k, v] of Object.entries({ ...base, asesoria_no: String(numero) })) {
        if (typeof v === 'string' && v.trim() !== '') finales[k] = v.trim();
      }

      // 2. Llenar el formato PDF con los datos
      const bytes = await generarPdfRecepcion(finales);
      const nombreArchivo = `recepcion-${numero}-${Date.now()}.pdf`;
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

      // 3. Subir el PDF a Supabase Storage (bucket "recepciones")
      const { error: errorSubida } = await supabase.storage.from('recepciones').upload(nombreArchivo, blob);
      if (errorSubida) throw errorSubida;
      const { data: urlData } = supabase.storage.from('recepciones').getPublicUrl(nombreArchivo);

      // 4. Separar los datos: columnas individuales vs JSON "detalles"
      const individuales: Record<string, unknown> = {};
      const detalles: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(finales)) {
        (CAMPOS_INDIVIDUALES.includes(k) ? individuales : detalles)[k] = v;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error: errorInsert } = await supabase.from('recepciones').insert({
        ...individuales,
        detalles,
        pdf_url: urlData.publicUrl,
        monitor_id: user?.id,
      });
      if (errorInsert) throw errorInsert;

      // 5. Todo guardado: descargar el PDF
      descargarArchivo(bytes, nombreArchivo);
      setGuardado({ numero: Number(numero), bytes, nombreArchivo });
      document.querySelector('.cp-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const texto = err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Ocurrió un error al guardar.';
      setMensaje({ tipo: 'error', texto });
    } finally {
      setGuardando(false);
      setAviso(false);
    }
  }

  return (
    <div className="cp-wrap">
      <PanelTopbar title="Formato de recepción" subtitle="Consultorio Jurídico · Unicórdoba" />
      <div className="cp-content">
        <FormProvider value={contexto}>
          <form
            className="rf"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (guardando) return;
              if (paso < ULTIMO_PASO) irAPaso(paso + 1);
              else if (!guardado) solicitarGuardado();
            }}
          >
            {guardado && (
              <div className="form-message success rf-exito">
                <span>
                  Recepción guardada con el N.º de asesoría <strong>{guardado.numero}</strong>. El PDF se descargó automáticamente.
                </span>
                <div className="rf-exito-acciones">
                  <button type="button" className="btn-secundario" onClick={() => descargarArchivo(guardado.bytes, guardado.nombreArchivo)}>
                    Descargar de nuevo
                  </button>
                  <button type="button" className="btn-primary" onClick={nuevoFormulario}>
                    Nueva recepción
                  </button>
                </div>
              </div>
            )}

            {/* ───────── Indicador de secciones (se puede tocar cualquiera sin perder lo escrito) ───────── */}
            <nav className="rf-pasos" aria-label="Secciones del formulario">
              {SECCIONES.map((s, i) => {
                const completa = faltantes[i].length === 0;
                return (
                  <button
                    key={s.titulo}
                    type="button"
                    className={`rf-paso${i === paso ? ' activo' : ''}${completa ? ' completo' : ''}`}
                    onClick={() => irAPaso(i)}
                    aria-current={i === paso ? 'step' : undefined}
                    title={s.titulo}
                  >
                    <span className="rf-paso-num">{completa ? '✓' : i + 1}</span>
                    <span className="rf-paso-texto">{s.corto}</span>
                  </button>
                );
              })}
            </nav>
            <div className="rf-progreso">Sección {paso + 1} de {SECCIONES.length}</div>

            {/* ───────── 1. Información del usuario ───────── */}
            {paso === 0 && (
              <Seccion titulo={`1. ${SECCIONES[0].titulo}`}>
                <Fila>
                  <div className="rf-campo">
                    <label htmlFor="rf-asesoria_no">N.º asesoría</label>
                    <input id="rf-asesoria_no" type="text" readOnly value={guardado ? String(guardado.numero) : ''} placeholder="Se asigna al guardar" />
                  </div>
                  <div className="rf-campo">
                    <label htmlFor="rf-fecha">Fecha</label>
                    <input
                      id="rf-fecha"
                      type="date"
                      value={aInputFecha(valores.fecha ?? '')}
                      onChange={(e) => set('fecha', deInputFecha(e.target.value))}
                    />
                  </div>
                  <Texto k="hora_recepcion" label="Hora de recepción" tipo="time" />
                </Fila>
                <Fila columnas="2fr 1fr">
                  <Texto k="nombres_apellidos" label="Nombre y apellido según documento de identidad *" />
                  <Texto k="nombre_identitario" label="Nombre identitario" />
                </Fila>
                <Fila>
                  <Texto k="contacto_1" label="N.º de contacto" tipo="tel" inputMode="tel" />
                  <Texto k="contacto_2" label="Otro N.º de contacto" tipo="tel" inputMode="tel" />
                  <Texto k="correo" label="Correo electrónico" />
                </Fila>
                <Fila columnas="1fr 2fr">
                  <Texto k="cedula_numero" label="N.º de documento" />
                  <Texto k="direccion" label="Ciudad / Dirección" />
                </Fila>
                <GrupoUnico titulo="Tipo de identificación" opciones={TIPO_IDENTIFICACION} />
                <SiNo
                  titulo="¿Presenta alguna discapacidad?"
                  kSi="discapacidad_si"
                  kNo="discapacidad_no"
                  limpiar={DISCAPACIDADES.map((d) => d.k)}
                >
                  <div className="rf-grupo-titulo">Tipo de discapacidad</div>
                  <div className="rf-opciones">
                    {DISCAPACIDADES.map((d) => <Casilla key={d.k} k={d.k} label={d.label} />)}
                  </div>
                </SiNo>
                <div className="rf-grupo">
                  <div className="rf-grupo-titulo">Caracterización poblacional</div>
                  <div className="rf-opciones rf-opciones-rejilla">
                    {POBLACION.map((p) => <Casilla key={p.k} k={p.k} label={p.label} />)}
                  </div>
                  <div style={{ marginTop: 12, maxWidth: 420 }}>
                    <Texto k="poblacion_otra" label="Otra" />
                  </div>
                </div>
              </Seccion>
            )}

            {/* ───────── 2. Aspectos económicos ───────── */}
            {paso === 1 && (
              <Seccion titulo={`2. ${SECCIONES[1].titulo}`}>
                <GrupoUnico titulo="Escolaridad" opciones={ESCOLARIDAD} />
                <div className="rf-grupo">
                  <div className="rf-grupo-titulo">Ocupación</div>
                  <div className="rf-opciones">
                    {OCUPACION.map((o) => <Casilla key={o.k} k={o.k} label={o.label} />)}
                  </div>
                </div>
                <Fila>
                  <Texto k="ingresos_mensuales" label="Ingresos mensuales" inputMode="numeric" />
                  <Texto k="estrato" label="Estrato" inputMode="numeric" />
                </Fila>
                <Fila>
                  <Texto k="empresa_trabajo" label="Empresa donde trabaja" />
                  <Texto k="direccion_trabajo" label="Dirección del lugar de trabajo" />
                </Fila>
              </Seccion>
            )}

            {/* ───────── 3. Bienes ───────── */}
            {paso === 2 && (
              <Seccion titulo={`3. ${SECCIONES[2].titulo}`}>
                <SiNo titulo="Vivienda propia o familiar" kSi="vivienda_propia_si" kNo="vivienda_propia_no" limpiar={['direccion_inmueble']}>
                  <Texto k="direccion_inmueble" label="Dirección del inmueble" />
                </SiNo>
                <SiNo titulo="Paga arriendo" kSi="paga_arriendo_si" kNo="paga_arriendo_no" limpiar={['valor_arriendo']}>
                  <Texto k="valor_arriendo" label="Valor de arriendo" inputMode="numeric" />
                </SiNo>
                <SiNo titulo="Lote propio" kSi="lote_propio_si" kNo="lote_propio_no" limpiar={['direccion_lote']}>
                  <Texto k="direccion_lote" label="Dirección" />
                </SiNo>
                <SiNo titulo="Vehículo" kSi="vehiculo_si" kNo="vehiculo_no" limpiar={['vehiculo_placa', 'vehiculo_marca', 'vehiculo_modelo']}>
                  <Fila>
                    <Texto k="vehiculo_placa" label="Placa" />
                    <Texto k="vehiculo_marca" label="Marca" />
                    <Texto k="vehiculo_modelo" label="Modelo" />
                  </Fila>
                </SiNo>
                <SiNo titulo="Negocio" kSi="negocio_si" kNo="negocio_no" limpiar={['negocio_especifique']}>
                  <Texto k="negocio_especifique" label="Especifique" />
                </SiNo>
                <Texto k="bienes_otro_cual" label="Otro: ¿cuál?" />
              </Seccion>
            )}

            {/* ───────── 4. Información personal ───────── */}
            {paso === 3 && (
              <Seccion titulo={`4. ${SECCIONES[3].titulo}`}>
                <GrupoUnico titulo="Estado civil" opciones={ESTADO_CIVIL} />
                <SiNo titulo="Unión marital de hecho" kSi="umh_si" kNo="umh_no" />
                <Fila>
                  <Texto k="personas_a_cargo" label="N.º personas a cargo" tipo="number" inputMode="numeric" />
                </Fila>
                <Fila>
                  <Texto k="nombre_conyuge" label="Nombre del cónyuge o compañero(a) permanente" />
                  <Texto k="conyuge_contacto" label="N.º de contacto del cónyuge o compañero(a) permanente" tipo="tel" inputMode="tel" />
                </Fila>
              </Seccion>
            )}

            {/* ───────── 5. ¿Cómo nos conoció? ───────── */}
            {paso === 4 && (
              <Seccion titulo={`5. ${SECCIONES[4].titulo}`}>
                <div className="rf-opciones rf-opciones-rejilla">
                  {COMO_NOS_CONOCIO.map((o) => <Casilla key={o.k} k={o.k} label={o.label} />)}
                </div>
              </Seccion>
            )}

            {/* ───────── 6. Estudiante que recepciona ───────── */}
            {paso === 5 && (
              <Seccion titulo={`6. ${SECCIONES[5].titulo}`}>
                <Fila columnas="2fr 1fr 1fr">
                  <Texto k="estudiante_recepciona_nombre" label="Nombres y apellidos *" />
                  <Texto k="estudiante_recepciona_codigo" label="Código" />
                  <Texto k="estudiante_recepciona_telefono" label="Teléfono" tipo="tel" inputMode="tel" />
                </Fila>

                <div className="rf-grupo">
                  <div className="rf-grupo-titulo">Síntesis de los hechos</div>
                  <p className="rf-ayuda">
                    Escuche de manera atenta el relato y luego elabore un resumen claro, preciso y detallado en letra legible.
                  </p>
                  <div className="rf-hechos">
                    {HECHOS.map((n) => <Hecho key={n} n={n} medidor={medidor} />)}
                  </div>
                </div>

                <div className="rf-grupo">
                  <div className="rf-grupo-titulo">Documentos aportados</div>
                  <div className="rf-fila">
                    {DOCUMENTOS.map((n) => <Texto key={n} k={`documento_aportado_${n}`} label={`Documento ${n}`} />)}
                  </div>
                </div>

                <Fila>
                  <Lista k="area_derecho" label="Área de derecho" opciones={AREAS_DERECHO} />
                  <Texto k="naturaleza_asunto" label="Naturaleza del asunto" />
                </Fila>

                <GrupoUnico titulo="Asesoría" opciones={ASESORIA_REPARTO} />
              </Seccion>
            )}

            {/* ───────── Barra de navegación ───────── */}
            <div className="rf-barra">
              <div className="rf-barra-mensaje">
                {mensaje && <span className={`rf-barra-texto ${mensaje.tipo}`}>{mensaje.texto}</span>}
                {!mensaje && guardado && <span className="rf-barra-texto success">Guardado. Pulsa «Nueva recepción» para llenar otro formato.</span>}
                {!mensaje && !guardado && (
                  <span className="rf-barra-ayuda">
                    * Campos obligatorios. Puedes moverte entre secciones sin perder lo que llevas escrito.
                  </span>
                )}
              </div>
              <div className="rf-barra-botones">
                <button type="button" className="btn-secundario" disabled={paso === 0 || guardando} onClick={() => irAPaso(paso - 1)}>
                  Anterior
                </button>
                {paso < ULTIMO_PASO ? (
                  <button type="button" className="btn-primary" onClick={() => irAPaso(paso + 1)}>
                    Siguiente
                  </button>
                ) : (
                  <button type="submit" className="btn-primary" disabled={guardando || Boolean(guardado)}>
                    {guardando ? 'Guardando...' : 'Guardar y descargar PDF'}
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* ───────── Advertencia: espacios en blanco ───────── */}
          {aviso && (
            <div className="modal-overlay" onClick={() => !guardando && setAviso(false)}>
              <div className="modal-card modal-card-ancho" onClick={(e) => e.stopPropagation()}>
                <div className="modal-card-cuerpo">
                  <h3>Hay {totalFaltantes} espacios sin llenar</h3>
                  <p className="rf-aviso-texto">
                    Si descargas de todas formas, los espacios de texto quedarán con <strong>{SIN_TEXTO}</strong> y
                    las opciones que no se eligieron quedarán marcadas con <strong>{SIN_SELECCION}</strong>.
                  </p>
                  {faltantes.map((lista: string[], i: number) => lista.length > 0 && (
                    <div key={SECCIONES[i].titulo} className="rf-aviso-seccion">
                      <div className="rf-aviso-cabecera">
                        <strong>{i + 1}. {SECCIONES[i].titulo}</strong>
                        <button type="button" className="rf-aviso-ir" onClick={() => { setAviso(false); irAPaso(i); }}>
                          Ir a esta sección
                        </button>
                      </div>
                      <ul>
                        {lista.map((etiqueta: string) => <li key={etiqueta}>{etiqueta}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="modal-acciones">
                  <button type="button" className="btn-secundario" disabled={guardando} onClick={() => setAviso(false)}>
                    Volver a completar
                  </button>
                  <button type="button" className="btn-primary" disabled={guardando} onClick={descargarDeTodasFormas}>
                    {guardando ? 'Guardando...' : 'Descargar de todas formas'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </FormProvider>
      </div>
    </div>
  );
}