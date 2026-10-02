'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar
import PanelTopbar from '@/components/PanelTopbar';
import {
  Casilla, Fila, FormProvider, GrupoUnico, Seccion, SiNo, Texto, useFormulario,
} from '@/components/recepcion/Controles';
import {
  CAMPOS_INDIVIDUALES, Medidor, Valores, crearMedidor, descargarArchivo,
  generarPdfRecepcion, partirEnLineas,
} from '@/lib/formatoRecepcion';

const DISCAPACIDADES = [
  { k: 'discapacidad_auditiva', label: 'Auditiva' },
  { k: 'discapacidad_sordoceguera', label: 'Sordo-ceguera' },
  { k: 'discapacidad_fisica', label: 'Física' },
  { k: 'discapacidad_intelectual', label: 'Intelectual' },
  { k: 'discapacidad_psicosocial', label: 'Psicosocial' },
  { k: 'discapacidad_multiple', label: 'Múltiple' },
];

const POBLACION = [
  { k: 'poblacion_mujer_embarazada', label: 'Mujer embarazada' },
  { k: 'poblacion_pobreza_extrema', label: 'Situación de pobreza extrema / exclusión social' },
  { k: 'poblacion_mujer_violencia_genero', label: 'Mujer víctima de violencia basada en género' },
  { k: 'poblacion_lgtbiq', label: 'Población LGTBIQ+ en riesgo' },
  { k: 'poblacion_victima_conflicto', label: 'Víctima del conflicto armado / desplazado' },
  { k: 'poblacion_migrante_refugiado', label: 'Migrante refugiado' },
  { k: 'poblacion_mayor_desproteccion', label: 'Persona mayor en desprotección' },
  { k: 'poblacion_nino_adolescente_riesgo', label: 'Niño/a o adolescente en riesgo' },
  { k: 'poblacion_privada_libertad', label: 'Persona privada de la libertad' },
  { k: 'poblacion_defensora_ddhh', label: 'Defensor@ de derechos humanos / lideresa comunitaria / mujer rural' },
  { k: 'poblacion_indigena', label: 'Indígena' },
  { k: 'poblacion_campesino', label: 'Campesino' },
  { k: 'poblacion_afro', label: 'Afro' },
  { k: 'poblacion_room', label: 'Room' },
  { k: 'poblacion_raizal_palenquera', label: 'Raizal / palenquera' },
];

const ESCOLARIDAD = [
  { k: 'escolaridad_primaria', label: 'Primaria' },
  { k: 'escolaridad_bachiller', label: 'Bachiller' },
  { k: 'escolaridad_tecnico', label: 'Técnico' },
  { k: 'escolaridad_pregrado', label: 'Pregrado' },
  { k: 'escolaridad_posgrado', label: 'Posgrado' },
  { k: 'escolaridad_ninguna', label: 'Ninguna' },
];

const COMO_NOS_CONOCIO = [
  { k: 'conocio_redes_sociales', label: 'Redes sociales' },
  { k: 'conocio_sede_fisica', label: 'Sede física' },
  { k: 'conocio_programa_radial', label: 'Programa radial' },
  { k: 'conocio_pagina_web', label: 'Página web' },
  { k: 'conocio_eventos_institucionales', label: 'Eventos institucionales' },
  { k: 'conocio_referido', label: 'Referido' },
  { k: 'conocio_ferias_educativas', label: 'Ferias educativas en articulación con otra entidad' },
  { k: 'conocio_publicidad', label: 'Publicidad' },
  { k: 'conocio_brigada_juridica', label: 'Brigada jurídica' },
];

const HECHOS = [1, 2, 3, 4, 5];
const DOCUMENTOS = [1, 2, 3, 4, 5];

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
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(null);
  const [guardado, setGuardado] = useState<{ numero: number; bytes: Uint8Array; nombreArchivo: string } | null>(null);

  const set = useCallback((k: string, v: string) => setValores((p) => ({ ...p, [k]: v })), []);
  const setVarios = useCallback((c: Valores) => setValores((p) => ({ ...p, ...c })), []);
  const contexto = useMemo(() => ({ valores, set, setVarios }), [valores, set, setVarios]);

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

  function nuevoFormulario() {
    setValores(valoresIniciales());
    setGuardado(null);
    setMensaje(null);
    document.querySelector('.cp-content')?.scrollTo({ top: 0 });
  }

  async function guardar() {
    setMensaje(null);

    const faltantes: string[] = [];
    if (!valores.nombres_apellidos?.trim()) faltantes.push('el nombre del usuario');
    if (!valores.estudiante_recepciona_nombre?.trim()) faltantes.push('el nombre del estudiante que recepciona');
    if (faltantes.length) {
      setMensaje({ tipo: 'error', texto: `Falta completar ${faltantes.join(' y ')}.` });
      return;
    }

    setGuardando(true);
    try {
      const medir = medidor ?? (await crearMedidor());
      for (const n of HECHOS) {
        if (partirEnLineas(valores[`sintesis_hecho_${n}`] ?? '', medir).desborde) {
          throw new Error(`El hecho ${n} no cabe en el espacio del formato. Acórtalo para poder guardar.`);
        }
      }

      // 1. Pedir el siguiente número de asesoría de forma atómica en la BD
      const { data: numero, error: errorNumero } = await supabase.rpc('siguiente_numero_asesoria');
      if (errorNumero) throw errorNumero;

      // Solo se guardan los campos con contenido
      const finales: Valores = {};
      for (const [k, v] of Object.entries({ ...valores, asesoria_no: String(numero) })) {
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
            onSubmit={(e) => { e.preventDefault(); if (!guardando && !guardado) guardar(); }}
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

            {/* ───────── 1. Información del usuario ───────── */}
            <Seccion titulo="Información del usuario">
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
              <GrupoUnico
                titulo="Tipo de identificación"
                opciones={[
                  { k: 'documento_ti', label: 'TI' },
                  { k: 'documento_cc', label: 'CC' },
                  { k: 'documento_ce', label: 'CE' },
                  { k: 'documento_ps', label: 'Pasaporte' },
                ]}
              />
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

            {/* ───────── 2. Aspectos económicos ───────── */}
            <Seccion titulo="Aspectos económicos e información laboral">
              <GrupoUnico titulo="Escolaridad" opciones={ESCOLARIDAD} />
              <div className="rf-grupo">
                <div className="rf-grupo-titulo">Ocupación</div>
                <div className="rf-opciones">
                  <Casilla k="asalariado" label="Asalariado" />
                  <Casilla k="independiente" label="Independiente" />
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

            {/* ───────── 3. Bienes ───────── */}
            <Seccion titulo="Bienes">
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

            {/* ───────── 4. Información personal ───────── */}
            <Seccion titulo="Información personal">
              <GrupoUnico
                titulo="Estado civil"
                opciones={[
                  { k: 'estado_civil_casado', label: 'Casado(a)' },
                  { k: 'estado_civil_soltero', label: 'Soltero(a)' },
                ]}
              />
              <SiNo titulo="Unión marital de hecho" kSi="umh_si" kNo="umh_no" />
              <Fila>
                <Texto k="personas_a_cargo" label="N.º personas a cargo" tipo="number" inputMode="numeric" />
              </Fila>
              <Fila>
                <Texto k="nombre_conyuge" label="Nombre del cónyuge o compañero(a) permanente" />
                <Texto k="conyuge_contacto" label="N.º de contacto del cónyuge o compañero(a) permanente" tipo="tel" inputMode="tel" />
              </Fila>
            </Seccion>

            {/* ───────── 5. ¿Cómo nos conoció? ───────── */}
            <Seccion titulo="¿Cómo nos conoció?">
              <div className="rf-opciones rf-opciones-rejilla">
                {COMO_NOS_CONOCIO.map((o) => <Casilla key={o.k} k={o.k} label={o.label} />)}
              </div>
            </Seccion>

            {/* ───────── 6. Estudiante que recepciona ───────── */}
            <Seccion titulo="Estudiante que recepciona">
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
                <Texto k="area_derecho" label="Área de derecho" />
                <Texto k="naturaleza_asunto" label="Naturaleza del asunto" />
              </Fila>

              <GrupoUnico
                titulo="Asesoría"
                opciones={[
                  { k: 'asesoria_con_reparto', label: 'Con reparto' },
                  { k: 'asesoria_sin_reparto', label: 'Sin reparto' },
                ]}
              />
            </Seccion>

            <div className="rf-barra">
              <div className="rf-barra-mensaje">
                {mensaje && <span className={`rf-barra-texto ${mensaje.tipo}`}>{mensaje.texto}</span>}
                {!mensaje && guardado && <span className="rf-barra-texto success">Guardado. Pulsa «Nueva recepción» para llenar otro formato.</span>}
                {!mensaje && !guardado && <span className="rf-barra-ayuda">* Campos obligatorios. El N.º de asesoría se asigna al guardar.</span>}
              </div>
              <button type="submit" className="btn-primary" disabled={guardando || Boolean(guardado)}>
                {guardando ? 'Guardando...' : 'Guardar y descargar PDF'}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
