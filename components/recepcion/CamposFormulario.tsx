'use client';

// Campos de las 6 secciones del formato de recepción.
// Se usa en la pantalla de Recepción (una sección a la vez) y en el modal de edición de Asignación (todas juntas).

import {
  Casilla, Fila, GrupoUnico, Lista, ListaClaves, Seccion, Segmento, SiNo, Tarjeta, Texto, useFormulario,
} from '@/components/recepcion/Controles';
import { LINEAS_HECHO, Medidor, Valores, partirEnLineas } from '@/lib/formatoRecepcion';
import {
  AREAS_DERECHO, ASESORIA_REPARTO, COMO_NOS_CONOCIO, DISCAPACIDADES, DOCUMENTOS, ESCOLARIDAD,
  ESTADO_CIVIL, HECHOS, OCUPACION, POBLACION, SECCIONES, TIPO_IDENTIFICACION, type Opcion,
} from '@/lib/estructuraRecepcion';

const aInputFecha = (f: string) => {
  const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const deInputFecha = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

// Nombre completo de cada tipo de documento (el formato guarda la sigla, aquí se muestra completo)
const NOMBRES_DOCUMENTO: Record<string, string> = {
  TI: 'Tarjeta de identidad',
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  Pasaporte: 'Pasaporte',
};

// Un hecho de la síntesis: cuadro de texto + aviso si no cabe en el espacio del formato
function Hecho({ n, medidor, obligatorio = false }: { n: number; medidor: Medidor | null; obligatorio?: boolean }) {
  const { valores, set } = useFormulario();
  const k = `sintesis_hecho_${n}`;
  const texto = valores[k] ?? '';
  // El PDF va en mayúsculas (ocupan más espacio), por eso se mide el texto ya en mayúsculas
  const { lineas, desborde } = medidor ? partirEnLineas(texto.toUpperCase(), medidor) : { lineas: [], desborde: false };
  return (
    <div className="rf-campo rf-hecho">
      <label htmlFor={`rf-${k}`}>Hecho {n}{obligatorio ? ' *' : ''}</label>
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
            : `${lineas.length} de ${LINEAS_HECHO} líneas del formato`}
        </div>
      )}
    </div>
  );
}

// Sección 3 (Bienes): las preguntas SI/NO y sus campos salen de SECCIONES (lib/estructuraRecepcion).
// Aquí solo se ajusta lo que se ve distinto en pantalla.
const ETIQUETA_EN_PANTALLA: Record<string, string> = { direccion_lote: 'Dirección' };
const CAMPOS_NUMERICOS = ['valor_arriendo'];

function DetalleBien({ campos }: { campos: Opcion[] }) {
  const textos = campos.map((d) => (
    <Texto
      key={d.k}
      k={d.k}
      label={ETIQUETA_EN_PANTALLA[d.k] ?? d.label}
      inputMode={CAMPOS_NUMERICOS.includes(d.k) ? 'numeric' : undefined}
    />
  ));
  return campos.length > 1 ? <Fila>{textos}</Fila> : <>{textos}</>;
}

// Estado civil + unión marital de hecho (UMH):
// - Soltero(a): se muestra la pregunta de UMH para que la responda.
// - Casado(a): la pregunta no se muestra y UMH queda marcada como NO automáticamente.
// Al cambiar de casado(a) a otra opción, la respuesta automática se borra para que no parezca una respuesta del usuario.
function EstadoCivilYUnion() {
  const { valores, setVarios } = useFormulario();
  const casado = Boolean(valores.estado_civil_casado);
  const soltero = Boolean(valores.estado_civil_soltero);

  function alternar(k: string) {
    const cambios: Valores = {};
    ESTADO_CIVIL.forEach((o) => { cambios[o.k] = ''; });
    const activando = !valores[k];
    if (activando) cambios[k] = 'X';
    if (k === 'estado_civil_casado') {
      cambios.umh_si = '';
      cambios.umh_no = activando ? 'X' : '';
    } else if (casado) {
      cambios.umh_si = '';
      cambios.umh_no = '';
    }
    setVarios(cambios);
  }

  return (
    <>
      <div className="rf-grupo">
        <div className="rf-grupo-titulo">Estado civil</div>
        <div className="rf-segmentos" role="radiogroup" aria-label="Estado civil">
          {ESTADO_CIVIL.map((o) => (
            <Segmento key={o.k} marcada={Boolean(valores[o.k])} onClick={() => alternar(o.k)}>{o.label}</Segmento>
          ))}
        </div>
      </div>
      {soltero && <SiNo titulo="Unión marital de hecho" kSi="umh_si" kNo="umh_no" />}
      {casado && <p className="rf-ayuda">Unión marital de hecho: NO (se marca automáticamente porque el usuario está casado).</p>}
    </>
  );
}

export default function CamposSeccion({
  paso,
  medidor,
  obligatorios = false,
}: {
  paso: number; // 0 a 5
  medidor: Medidor | null;
  obligatorios?: boolean; // true en la pantalla de Recepción: muestra el * en los campos que no se pueden dejar vacíos
}) {
  const { valores, set } = useFormulario();
  return (
    <>
    {/* ───────── 1. Información del usuario ───────── */}
    {paso === 0 && (
      <Seccion titulo={`1. ${SECCIONES[0].titulo}`}>
        <Tarjeta titulo="Datos de la asesoría">
          <Fila>
            {/* El N.º de asesoría SIEMPRE se escribe a mano (monitor o administrador); es opcional y se puede poner después */}
            <Texto k="asesoria_no" label="N.º asesoría" inputMode="numeric" />
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
        </Tarjeta>

        <Tarjeta titulo="Datos personales">
          <Fila columnas="2fr 1fr">
            <Texto k="nombres_apellidos" label="Nombre y apellido según documento de identidad *" />
            <Texto k="nombre_identitario" label="Nombre identitario" />
          </Fila>
          <Fila columnas="1.1fr 1fr 1.9fr">
            <ListaClaves label="Tipo de documento" opciones={TIPO_IDENTIFICACION} nombres={NOMBRES_DOCUMENTO} />
            <Texto k="cedula_numero" label="N.º de documento" />
            <Texto k="direccion" label="Ciudad / Dirección" />
          </Fila>
        </Tarjeta>

        <Tarjeta titulo="Contacto">
          <Fila>
            <Texto k="contacto_1" label="N.º de contacto" tipo="tel" inputMode="tel" />
            <Texto k="contacto_2" label="Otro N.º de contacto" tipo="tel" inputMode="tel" />
            <Texto k="correo" label="Correo electrónico" />
          </Fila>
        </Tarjeta>

        <Tarjeta titulo="Condición y caracterización">
          <SiNo
            titulo="¿Presenta alguna discapacidad?"
            kSi="discapacidad_si"
            kNo="discapacidad_no"
            limpiar={DISCAPACIDADES.map((d) => d.k)}
            enLinea={<ListaClaves opciones={DISCAPACIDADES} placeholder="Tipo de discapacidad *" />}
          />
          <div className="rf-grupo">
            <div className="rf-grupo-titulo">Caracterización poblacional</div>
            <p className="rf-ayuda">Puede marcar varias opciones.</p>
            <div className="rf-opciones rf-opciones-rejilla">
              {POBLACION.map((p) => <Casilla key={p.k} k={p.k} label={p.label} />)}
            </div>
            <div style={{ marginTop: 12, maxWidth: 420 }}>
              <Texto k="poblacion_otra" label="Otra" />
            </div>
          </div>
        </Tarjeta>
      </Seccion>
    )}

    {/* ───────── 2. Aspectos económicos ───────── */}
    {paso === 1 && (
      <Seccion titulo={`2. ${SECCIONES[1].titulo}`}>
        <Tarjeta titulo="Formación y ocupación">
          <Fila>
            <ListaClaves label="Escolaridad" opciones={ESCOLARIDAD} />
            <div className="rf-campo">
              <div className="rf-etiqueta">Ocupación</div>
              <div className="rf-opciones rf-opciones-linea">
                {OCUPACION.map((o) => <Casilla key={o.k} k={o.k} label={o.label} />)}
              </div>
            </div>
          </Fila>
        </Tarjeta>
        <Tarjeta titulo="Ingresos y lugar de trabajo">
          <Fila>
            <Texto k="ingresos_mensuales" label="Ingresos mensuales" inputMode="numeric" />
            <Texto k="estrato" label="Estrato" inputMode="numeric" />
          </Fila>
          <Fila>
            <Texto k="empresa_trabajo" label="Empresa donde trabaja" />
            <Texto k="direccion_trabajo" label="Dirección del lugar de trabajo" />
          </Fila>
        </Tarjeta>
      </Seccion>
    )}

    {/* ───────── 3. Bienes ───────── */}
    {paso === 2 && (
      <Seccion titulo={`3. ${SECCIONES[2].titulo}`}>
        {SECCIONES[2].items.map((it) =>
          it.tipo === 'sino' ? (
            <SiNo key={it.kSi} titulo={it.label} kSi={it.kSi} kNo={it.kNo} limpiar={it.detalle?.map((d) => d.k)}>
              <DetalleBien campos={it.detalle ?? []} />
            </SiNo>
          ) : it.tipo === 'texto' ? (
            <Texto key={it.k} k={it.k} label={it.label} />
          ) : null
        )}
      </Seccion>
    )}

    {/* ───────── 4. Información personal ───────── */}
    {paso === 3 && (
      <Seccion titulo={`4. ${SECCIONES[3].titulo}`}>
        <Tarjeta titulo="Estado civil">
          <EstadoCivilYUnion />
        </Tarjeta>
        <Tarjeta titulo="Familia">
          <Fila columnas="minmax(150px, 0.6fr) 1.6fr 1.2fr">
            <Texto k="personas_a_cargo" label="N.º personas a cargo" tipo="number" inputMode="numeric" />
            <Texto k="nombre_conyuge" label="Cónyuge o compañero(a) permanente" />
            <Texto k="conyuge_contacto" label="N.º de contacto del cónyuge" tipo="tel" inputMode="tel" />
          </Fila>
        </Tarjeta>
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
        <Tarjeta titulo="Estudiante que recepciona">
          <Fila columnas="2fr 1fr 1fr">
            <Texto k="estudiante_recepciona_nombre" label="Nombres y apellidos *" />
            <Texto k="estudiante_recepciona_codigo" label="Código" />
            <Texto k="estudiante_recepciona_telefono" label="Teléfono" tipo="tel" inputMode="tel" />
          </Fila>
        </Tarjeta>

        <Tarjeta titulo="Síntesis de los hechos">
          <p className="rf-ayuda">
            Escuche de manera atenta el relato y luego elabore un resumen claro, preciso y detallado en letra legible.
          </p>
          <div className="rf-hechos">
            {HECHOS.map((n) => <Hecho key={n} n={n} medidor={medidor} obligatorio={obligatorios && n === 1} />)}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Documentos aportados">
          <div className="rf-fila">
            {DOCUMENTOS.map((n) => <Texto key={n} k={`documento_aportado_${n}`} label={`Documento ${n}`} />)}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Clasificación del caso">
          <Fila>
            <Lista k="area_derecho" label={`Área de derecho${obligatorios ? ' *' : ''}`} opciones={AREAS_DERECHO} />
            <Texto k="naturaleza_asunto" label={`Naturaleza del asunto${obligatorios ? ' *' : ''}`} />
          </Fila>
          <GrupoUnico titulo={`Asesoría (con o sin reparto)${obligatorios ? ' *' : ''}`} opciones={ASESORIA_REPARTO} />
        </Tarjeta>
      </Seccion>
    )}
    </>
  );
}