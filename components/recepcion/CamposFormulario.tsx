'use client';

// Campos de las 6 secciones del formato de recepción.
// Se usa en la pantalla de Recepción (una sección a la vez) y en el modal de edición de Asignación (todas juntas).

import {
  Casilla, Fila, GrupoUnico, Lista, Seccion, SiNo, Texto, useFormulario,
} from '@/components/recepcion/Controles';
import { LINEAS_HECHO, Medidor, Valores, partirEnLineas } from '@/lib/formatoRecepcion';
import {
  AREAS_DERECHO, ASESORIA_REPARTO, COMO_NOS_CONOCIO, DISCAPACIDADES, DOCUMENTOS, ESCOLARIDAD,
  ESTADO_CIVIL, HECHOS, OCUPACION, POBLACION, SECCIONES, TIPO_IDENTIFICACION,
} from '@/lib/estructuraRecepcion';

const aInputFecha = (f: string) => {
  const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const deInputFecha = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
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
        <div className="rf-opciones">
          {ESTADO_CIVIL.map((o) => {
            const marcada = Boolean(valores[o.k]);
            return (
              <label key={o.k} className={`rf-opcion${marcada ? ' marcada' : ''}`}>
                <input type="checkbox" checked={marcada} onChange={() => alternar(o.k)} />
                <span>{o.label}</span>
              </label>
            );
          })}
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
        <EstadoCivilYUnion />
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
            {HECHOS.map((n) => <Hecho key={n} n={n} medidor={medidor} obligatorio={obligatorios && n === 1} />)}
          </div>
        </div>

        <div className="rf-grupo">
          <div className="rf-grupo-titulo">Documentos aportados</div>
          <div className="rf-fila">
            {DOCUMENTOS.map((n) => <Texto key={n} k={`documento_aportado_${n}`} label={`Documento ${n}`} />)}
          </div>
        </div>

        <Fila>
          <Lista k="area_derecho" label={`Área de derecho${obligatorios ? ' *' : ''}`} opciones={AREAS_DERECHO} />
          <Texto k="naturaleza_asunto" label={`Naturaleza del asunto${obligatorios ? ' *' : ''}`} />
        </Fila>

        <GrupoUnico titulo={`Asesoría (con o sin reparto)${obligatorios ? ' *' : ''}`} opciones={ASESORIA_REPARTO} />
      </Seccion>
    )}
    </>
  );
}