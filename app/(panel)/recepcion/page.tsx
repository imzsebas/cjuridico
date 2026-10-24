'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermiso } from '@/lib/sesion';
import { mensajeDe } from '@/lib/utilidades';
import PanelTopbar from '@/components/PanelTopbar';
import Modal from '@/components/Modal';
import { FormProvider } from '@/components/recepcion/Controles';
import CamposSeccion from '@/components/recepcion/CamposFormulario';
import {
  CAMPOS_INDIVIDUALES, Medidor, Valores, aMayusculas, crearMedidor, descargarArchivo, generarPdfRecepcion,
} from '@/lib/formatoRecepcion';
import {
  DISCAPACIDADES, SECCIONES, SIN_SELECCION, SIN_TEXTO, completarEnBlanco, hechoQueNoCabe, revisarFormulario,
} from '@/lib/estructuraRecepcion';

const ULTIMO_PASO = SECCIONES.length - 1;

function valoresIniciales(): Valores {
  const ahora = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return {
    fecha: `${dos(ahora.getDate())}/${dos(ahora.getMonth() + 1)}/${ahora.getFullYear()}`,
    hora_recepcion: `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`,
  };
}

export default function RecepcionPage() {
  // Solo monitores o administradores pueden entrar aquí
  const sesion = usePermiso(['monitor', 'administrador']);
  const [valores, setValores] = useState<Valores>({});
  const [medidor, setMedidor] = useState<Medidor | null>(null);
  const [paso, setPaso] = useState(0);
  const [aviso, setAviso] = useState(false); // ventana de "hay espacios sin llenar"
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; titulo: string; texto: string } | null>(null);
  const [guardado, setGuardado] = useState<{ numero: string; bytes: Uint8Array; nombreArchivo: string } | null>(null);

  const set = useCallback((k: string, v: string) => setValores((p) => ({ ...p, [k]: v })), []);
  const setVarios = useCallback((c: Valores) => setValores((p) => ({ ...p, ...c })), []);
  const contexto = useMemo(() => ({ valores, set, setVarios }), [valores, set, setVarios]);

  // Espacios en blanco de cada sección (sirve para el check de los pasos y para la advertencia)
  const faltantes: string[][] = useMemo(() => revisarFormulario(valores), [valores]);
  const totalFaltantes = faltantes.reduce((suma: number, lista: string[]) => suma + lista.length, 0);

  // Barra de progreso: usa la misma revisión que genera el aviso de "espacios sin llenar",
  // así que llega al 100 % justo cuando ya no queda nada por llenar.
  const totalEspacios = useMemo(
    () => revisarFormulario(valoresIniciales()).reduce((suma: number, lista: string[]) => suma + lista.length, 0),
    [],
  );
  const progreso = totalEspacios > 0
    ? Math.min(100, Math.max(0, Math.round(((totalEspacios - totalFaltantes) / totalEspacios) * 100)))
    : 0;

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

    // Obligatorios: nombre del usuario, tipo de discapacidad (si respondió SI), estudiante que recepciona,
    // hecho 1, área de derecho, naturaleza del asunto y reparto (con o sin).
    // `lleno` dice si el campo ya está diligenciado.
    const lleno = (k: string) => Boolean(valores[k]?.trim());
    const obligatorios: { ok: boolean; texto: string; paso: number }[] = [
      { ok: lleno('nombres_apellidos'), texto: 'el nombre del usuario (sección 1)', paso: 0 },
      { ok: !lleno('discapacidad_si') || DISCAPACIDADES.some((d) => lleno(d.k)), texto: 'el tipo de discapacidad (sección 1)', paso: 0 },
      { ok: lleno('estudiante_recepciona_nombre'), texto: 'el nombre del estudiante que recepciona (sección 6)', paso: ULTIMO_PASO },
      { ok: lleno('sintesis_hecho_1'), texto: 'el hecho 1 (sección 6)', paso: ULTIMO_PASO },
      { ok: lleno('area_derecho'), texto: 'el área de derecho (sección 6)', paso: ULTIMO_PASO },
      { ok: lleno('naturaleza_asunto'), texto: 'la naturaleza del asunto (sección 6)', paso: ULTIMO_PASO },
      { ok: lleno('asesoria_con_reparto') || lleno('asesoria_sin_reparto'), texto: 'si la asesoría es con o sin reparto (sección 6)', paso: ULTIMO_PASO },
    ];
    const sinLlenar = obligatorios.filter((o) => !o.ok);
    if (sinLlenar.length) {
      const textos = sinLlenar.map((o) => o.texto);
      const lista = textos.length > 1 ? `${textos.slice(0, -1).join(', ')} y ${textos[textos.length - 1]}` : textos[0];
      setMensaje({ tipo: 'error', titulo: 'Faltan datos obligatorios', texto: `Falta completar ${lista}.` });
      irAPaso(sinLlenar[0].paso);
      return;
    }

    if (totalFaltantes > 0) {
      setAviso(true);
      return;
    }
    guardar(valores);
  }

  // El usuario decidió descargar aunque haya espacios sin llenar.
  // Se rellena solo para el PDF/guardado; el formulario en pantalla NO se toca
  // (así, si el guardado falla, no quedan casillas marcadas con "-").
  function descargarDeTodasFormas() {
    guardar(completarEnBlanco(valores));
  }

  async function guardar(base: Valores) {
    setMensaje(null);
    setGuardando(true);
    let archivoSubido: string | null = null;
    try {
      // El N.º de asesoría es opcional: se puede escribir ahora o después (desde Asignación)
      const numero = (base.asesoria_no ?? '').trim();

      const noCabe = await hechoQueNoCabe(base, medidor);
      if (noCabe) {
        irAPaso(ULTIMO_PASO);
        throw new Error(`El hecho ${noCabe} no cabe en el espacio del formato. Acórtalo para poder guardar.`);
      }

      // 1. Si escribió un número, que no se repita
      if (numero) {
        // La consulta pasa por una función de la base: el monitor solo puede leer sus propias
        // recepciones, pero el número no debe repetirse entre todas.
        const { data: yaExiste, error: errorRepetida } = await supabase
          .rpc('numero_asesoria_existe', { p_numero: numero });
        if (errorRepetida) throw errorRepetida;
        if (yaExiste) {
          irAPaso(0);
          throw new Error(`Ya existe una asesoría con el N.º ${numero}. Revisa el número.`);
        }
      }

      // Solo se guardan los campos con contenido
      const finales: Valores = {};
      for (const [k, v] of Object.entries({ ...base, asesoria_no: numero })) {
        if (typeof v === 'string' && v.trim() !== '') finales[k] = aMayusculas(k, v.trim());
      }

      // 2. Llenar el formato PDF con los datos
      const bytes = await generarPdfRecepcion(finales);
      const nombreArchivo = `recepcion-${numero ? numero.replace(/[^A-Za-z0-9_-]/g, '_') : 'sin-numero'}-${Date.now()}.pdf`;

      // 3. Subir el PDF a Supabase Storage (bucket "recepciones")
      const { error: errorSubida } = await supabase.storage
        .from('recepciones')
        .upload(nombreArchivo, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      if (errorSubida) throw errorSubida;
      archivoSubido = nombreArchivo;

      // 4. Separar los datos: columnas individuales vs JSON "detalles"
      const individuales: Record<string, unknown> = {};
      const detalles: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(finales)) {
        (CAMPOS_INDIVIDUALES.includes(k) ? individuales : detalles)[k] = v;
      }
      const { error: errorInsert } = await supabase.from('recepciones').insert({
        ...individuales,
        detalles,
        pdf_url: nombreArchivo, // el bucket es privado: se guarda solo la ruta del archivo
        monitor_id: sesion?.userId,
      });
      if (errorInsert) {
        // Otro monitor guardó el mismo número un instante antes (lo impide el índice único de la base)
        if (errorInsert.code === '23505') throw new Error(`Ya existe una asesoría con el N.º ${numero}. Revisa el número.`);
        throw errorInsert;
      }
      archivoSubido = null; // todo salió bien: el PDF se queda en Storage

      // 5. Todo guardado: descargar el PDF
      descargarArchivo(bytes, nombreArchivo);
      setGuardado({ numero, bytes, nombreArchivo });
      document.querySelector('.cp-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // Si el PDF alcanzó a subirse pero no se pudo guardar el registro, se borra para no dejarlo huérfano
      if (archivoSubido) await supabase.storage.from('recepciones').remove([archivoSubido]);
      setMensaje({ tipo: 'error', titulo: 'No se pudo guardar', texto: mensajeDe(err, 'Ocurrió un error al guardar.') });
    } finally {
      setGuardando(false);
      setAviso(false);
    }
  }

  // Botones del encabezado (fuera del <form>, por eso usan onClick y no type="submit")
  const acciones = (
    <div className="rf-acciones">
      <button type="button" className="cp-add-btn secundario" disabled={paso === 0 || guardando} onClick={() => irAPaso(paso - 1)}>
        Anterior
      </button>
      {paso < ULTIMO_PASO ? (
        <button type="button" className="cp-add-btn" onClick={() => irAPaso(paso + 1)}>
          Siguiente
        </button>
      ) : (
        <button
          type="button"
          className="cp-add-btn"
          disabled={guardando || Boolean(guardado)}
          onClick={() => { if (!guardando && !guardado) solicitarGuardado(); }}
        >
          {guardando ? 'Guardando...' : 'Guardar y descargar PDF'}
        </button>
      )}
    </div>
  );

  return (
    <div className="cp-wrap">
      <PanelTopbar title="Formato de recepción" subtitle="Consultorio Jurídico · Unicórdoba" action={acciones} />
      {/* Barra de progreso pegada justo debajo del encabezado */}
      <div
        className="rf-avance"
        role="progressbar"
        aria-label="Avance del formulario"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progreso}
      >
        <div className={`rf-avance-relleno${progreso === 100 ? ' completo' : ''}`} style={{ width: `${progreso}%` }} />
      </div>
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
                  {guardado.numero
                    ? <>Recepción guardada con el N.º de asesoría <strong>{guardado.numero}</strong>.</>
                    : <>Recepción guardada sin N.º de asesoría (se puede colocar después).</>}{' '}
                  El PDF se descargó automáticamente.
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

            <CamposSeccion paso={paso} medidor={medidor} obligatorios />
          </form>

          {/* ───────── Mensaje (datos obligatorios o error al guardar) ───────── */}
          {mensaje && (
            <Modal
              onFuera={() => setMensaje(null)}
              compactas={false}
              acciones={
                <button type="button" className="btn-primary" autoFocus onClick={() => setMensaje(null)}>
                  Entendido
                </button>
              }
            >
              <h3>{mensaje.titulo}</h3>
              <p className="rf-aviso-texto">{mensaje.texto}</p>
            </Modal>
          )}

          {/* ───────── Advertencia: espacios en blanco ───────── */}
          {aviso && (
            <Modal
              clase="modal-card-ancho"
              onFuera={() => !guardando && setAviso(false)}
              compactas={false}
              acciones={
                <>
                  <button type="button" className="btn-secundario" disabled={guardando} onClick={() => setAviso(false)}>
                    Volver a completar
                  </button>
                  <button type="button" className="btn-primary" disabled={guardando} onClick={descargarDeTodasFormas}>
                    {guardando ? 'Guardando...' : 'Descargar de todas formas'}
                  </button>
                </>
              }
            >
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
            </Modal>
          )}
        </FormProvider>
      </div>
    </div>
  );
}