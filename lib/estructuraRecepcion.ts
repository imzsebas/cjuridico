// Estructura del formulario de recepción por secciones: qué campos tiene cada una,
// cuáles quedaron en blanco y cómo se rellenan si la persona decide descargar igual.

import { CAMPOS_INDIVIDUALES, aMayusculas, norm, valoresDesdeFila, type Valores } from '@/lib/formatoRecepcion';

// Lo que se escribe cuando algo queda sin llenar y se descarga de todas formas.
export const SIN_TEXTO = 'N/A'; // espacios de texto vacíos
export const SIN_SELECCION = '-'; // casillas de un grupo en el que no se eligió nada (cabe en el cuadrito del PDF)

export const AREAS_DERECHO = ['DERECHO PUBLICO', 'DERECHO PRIVADO', 'DERECHO LABORAL', 'DERECHO PENAL'];

export type Opcion = { k: string; label: string };

export const DISCAPACIDADES: Opcion[] = [
  { k: 'discapacidad_auditiva', label: 'Auditiva' },
  { k: 'discapacidad_sordoceguera', label: 'Sordo-ceguera' },
  { k: 'discapacidad_fisica', label: 'Física' },
  { k: 'discapacidad_intelectual', label: 'Intelectual' },
  { k: 'discapacidad_psicosocial', label: 'Psicosocial' },
  { k: 'discapacidad_multiple', label: 'Múltiple' },
];

export const POBLACION: Opcion[] = [
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

export const TIPO_IDENTIFICACION: Opcion[] = [
  { k: 'documento_ti', label: 'TI' },
  { k: 'documento_cc', label: 'CC' },
  { k: 'documento_ce', label: 'CE' },
  { k: 'documento_ps', label: 'Pasaporte' },
];

export const ESCOLARIDAD: Opcion[] = [
  { k: 'escolaridad_primaria', label: 'Primaria' },
  { k: 'escolaridad_bachiller', label: 'Bachiller' },
  { k: 'escolaridad_tecnico', label: 'Técnico' },
  { k: 'escolaridad_pregrado', label: 'Pregrado' },
  { k: 'escolaridad_posgrado', label: 'Posgrado' },
  { k: 'escolaridad_ninguna', label: 'Ninguna' },
];

export const OCUPACION: Opcion[] = [
  { k: 'asalariado', label: 'Asalariado' },
  { k: 'independiente', label: 'Independiente' },
];

export const ESTADO_CIVIL: Opcion[] = [
  { k: 'estado_civil_casado', label: 'Casado(a)' },
  { k: 'estado_civil_soltero', label: 'Soltero(a)' },
];

export const COMO_NOS_CONOCIO: Opcion[] = [
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

export const ASESORIA_REPARTO: Opcion[] = [
  { k: 'asesoria_con_reparto', label: 'Con reparto' },
  { k: 'asesoria_sin_reparto', label: 'Sin reparto' },
];

export const HECHOS = [1, 2, 3, 4, 5];
export const DOCUMENTOS = [1, 2, 3, 4, 5];

type Item =
  | { tipo: 'texto'; k: string; label: string }
  | { tipo: 'opciones'; label: string; opciones: Opcion[] } // grupo de casillas (una o varias)
  | {
      tipo: 'sino';
      label: string;
      kSi: string;
      kNo: string;
      detalle?: Opcion[]; // campos de texto que se piden solo si la respuesta es SI
      subopciones?: { label: string; opciones: Opcion[] }; // casillas que se piden solo si la respuesta es SI
    };

export type SeccionDef = { titulo: string; corto: string; items: Item[] };

const texto = (k: string, label: string): Item => ({ tipo: 'texto', k, label });

export const SECCIONES: SeccionDef[] = [
  {
    titulo: 'Información del usuario',
    corto: 'Usuario',
    items: [
      texto('fecha', 'Fecha'),
      texto('hora_recepcion', 'Hora de recepción'),
      texto('nombres_apellidos', 'Nombre y apellido según documento de identidad'),
      texto('nombre_identitario', 'Nombre identitario'),
      texto('contacto_1', 'N.º de contacto'),
      texto('contacto_2', 'Otro N.º de contacto'),
      texto('correo', 'Correo electrónico'),
      texto('cedula_numero', 'N.º de documento'),
      texto('direccion', 'Ciudad / Dirección'),
      { tipo: 'opciones', label: 'Tipo de identificación', opciones: TIPO_IDENTIFICACION },
      {
        tipo: 'sino',
        label: '¿Presenta alguna discapacidad?',
        kSi: 'discapacidad_si',
        kNo: 'discapacidad_no',
        subopciones: { label: 'Tipo de discapacidad', opciones: DISCAPACIDADES },
      },
      { tipo: 'opciones', label: 'Caracterización poblacional', opciones: POBLACION },
      texto('poblacion_otra', 'Caracterización poblacional: Otra'),
    ],
  },
  {
    titulo: 'Aspectos económicos e información laboral',
    corto: 'Económico',
    items: [
      { tipo: 'opciones', label: 'Escolaridad', opciones: ESCOLARIDAD },
      { tipo: 'opciones', label: 'Ocupación', opciones: OCUPACION },
      texto('ingresos_mensuales', 'Ingresos mensuales'),
      texto('estrato', 'Estrato'),
      texto('empresa_trabajo', 'Empresa donde trabaja'),
      texto('direccion_trabajo', 'Dirección del lugar de trabajo'),
    ],
  },
  {
    titulo: 'Bienes',
    corto: 'Bienes',
    items: [
      {
        tipo: 'sino',
        label: 'Vivienda propia o familiar',
        kSi: 'vivienda_propia_si',
        kNo: 'vivienda_propia_no',
        detalle: [{ k: 'direccion_inmueble', label: 'Dirección del inmueble' }],
      },
      {
        tipo: 'sino',
        label: 'Paga arriendo',
        kSi: 'paga_arriendo_si',
        kNo: 'paga_arriendo_no',
        detalle: [{ k: 'valor_arriendo', label: 'Valor de arriendo' }],
      },
      {
        tipo: 'sino',
        label: 'Lote propio',
        kSi: 'lote_propio_si',
        kNo: 'lote_propio_no',
        detalle: [{ k: 'direccion_lote', label: 'Dirección del lote' }],
      },
      {
        tipo: 'sino',
        label: 'Vehículo',
        kSi: 'vehiculo_si',
        kNo: 'vehiculo_no',
        detalle: [
          { k: 'vehiculo_placa', label: 'Placa' },
          { k: 'vehiculo_marca', label: 'Marca' },
          { k: 'vehiculo_modelo', label: 'Modelo' },
        ],
      },
      {
        tipo: 'sino',
        label: 'Negocio',
        kSi: 'negocio_si',
        kNo: 'negocio_no',
        detalle: [{ k: 'negocio_especifique', label: 'Especifique' }],
      },
      texto('bienes_otro_cual', 'Otro: ¿cuál?'),
    ],
  },
  {
    titulo: 'Información personal',
    corto: 'Personal',
    items: [
      { tipo: 'opciones', label: 'Estado civil', opciones: ESTADO_CIVIL },
      { tipo: 'sino', label: 'Unión marital de hecho', kSi: 'umh_si', kNo: 'umh_no' },
      texto('personas_a_cargo', 'N.º personas a cargo'),
      texto('nombre_conyuge', 'Nombre del cónyuge o compañero(a) permanente'),
      texto('conyuge_contacto', 'N.º de contacto del cónyuge o compañero(a) permanente'),
    ],
  },
  {
    titulo: '¿Cómo nos conoció?',
    corto: 'Cómo nos conoció',
    items: [{ tipo: 'opciones', label: '¿Cómo nos conoció?', opciones: COMO_NOS_CONOCIO }],
  },
  {
    titulo: 'Estudiante que recepciona',
    corto: 'Estudiante',
    items: [
      texto('estudiante_recepciona_nombre', 'Nombres y apellidos del estudiante'),
      texto('estudiante_recepciona_codigo', 'Código del estudiante'),
      texto('estudiante_recepciona_telefono', 'Teléfono del estudiante'),
      ...HECHOS.map((n) => texto(`sintesis_hecho_${n}`, `Hecho ${n}`)),
      ...DOCUMENTOS.map((n) => texto(`documento_aportado_${n}`, `Documento aportado ${n}`)),
      texto('area_derecho', 'Área de derecho'),
      texto('naturaleza_asunto', 'Naturaleza del asunto'),
      { tipo: 'opciones', label: 'Asesoría (con / sin reparto)', opciones: ASESORIA_REPARTO },
    ],
  },
];

const vacio = (v?: string) => !v || v.trim() === '';
const hayMarcada = (v: Valores, ops: Opcion[]) =>
  ops.some((o) => !vacio(v[o.k]) && v[o.k] !== SIN_SELECCION);

// Devuelve, para cada sección, los nombres de los espacios que quedaron en blanco.
export function revisarFormulario(v: Valores): string[][] {
  return SECCIONES.map((sec) => {
    const faltan: string[] = [];
    for (const it of sec.items) {
      if (it.tipo === 'texto') {
        if (vacio(v[it.k]) || v[it.k] === SIN_TEXTO) faltan.push(it.label);
      } else if (it.tipo === 'opciones') {
        if (!hayMarcada(v, it.opciones)) faltan.push(it.label);
      } else {
        const si = !vacio(v[it.kSi]) && v[it.kSi] !== SIN_SELECCION;
        const no = !vacio(v[it.kNo]) && v[it.kNo] !== SIN_SELECCION;
        if (!si && !no) {
          faltan.push(it.label);
        } else if (si) {
          // El detalle solo se pide cuando la respuesta es SI
          it.detalle?.forEach((d) => {
            if (vacio(v[d.k]) || v[d.k] === SIN_TEXTO) faltan.push(`${it.label}: ${d.label}`);
          });
          if (it.subopciones && !hayMarcada(v, it.subopciones.opciones)) faltan.push(it.subopciones.label);
        }
      }
    }
    return faltan;
  });
}

// Rellena lo que quedó en blanco: "N/A" en los textos y "-" en las casillas sin elegir.
export function completarEnBlanco(v: Valores): Valores {
  const r: Valores = { ...v };
  const marcarGrupo = (ops: Opcion[]) => ops.forEach((o) => { r[o.k] = SIN_SELECCION; });
  const textoVacio = (k: string) => { if (vacio(r[k])) r[k] = SIN_TEXTO; };

  for (const sec of SECCIONES) {
    for (const it of sec.items) {
      if (it.tipo === 'texto') {
        textoVacio(it.k);
      } else if (it.tipo === 'opciones') {
        if (!hayMarcada(r, it.opciones)) marcarGrupo(it.opciones);
      } else {
        const si = !vacio(r[it.kSi]);
        const no = !vacio(r[it.kNo]);
        if (!si && !no) marcarGrupo([{ k: it.kSi, label: '' }, { k: it.kNo, label: '' }]);
        it.detalle?.forEach((d) => textoVacio(d.k));
        if (si && it.subopciones && !hayMarcada(r, it.subopciones.opciones)) marcarGrupo(it.subopciones.opciones);
      }
    }
  }
  return r;
}

// ───────── Para la pantalla de Asignación ─────────

// "Sí" / "No" según la casilla Con reparto / Sin reparto que marcó el monitor (null si no marcó ninguna)
export function repartoDe(detalles: unknown): 'Sí' | 'No' | null {
  const v = valoresDesdeFila({ detalles });
  if (v.asesoria_con_reparto === 'X') return 'Sí';
  if (v.asesoria_sin_reparto === 'X') return 'No';
  return null;
}

export type DatoCaso = { label: string; valor: string; largo?: boolean };
export type SeccionCaso = { titulo: string; datos: DatoCaso[] };

// Convierte un registro guardado (fila de "recepciones") en lo que se muestra en el modal de detalle:
// las mismas 6 secciones del formulario, solo con la información tomada del caso.
export function resumenCaso(fila: Record<string, unknown>): SeccionCaso[] {
  const v = valoresDesdeFila(fila);
  const dato = (x?: string) => (x && x.trim() !== '' ? x : '—');
  const marcadas = (ops: Opcion[]) => {
    const lista = ops.filter((o) => v[o.k] === 'X').map((o) => o.label);
    return lista.length ? lista.join(', ') : '—';
  };
  const siNo = (kSi: string, kNo: string) => (v[kSi] === 'X' ? 'Sí' : v[kNo] === 'X' ? 'No' : '—');

  // Los registros antiguos guardan cada hecho partido en 3 líneas (sintesis_hecho_11, _12, _13)
  const hecho = (n: number) =>
    v[`sintesis_hecho_${n}`] ??
    [1, 2, 3].map((i) => v[`sintesis_hecho_${n}${i}`]).filter(Boolean).join(' ');

  return SECCIONES.map((sec) => {
    const datos: DatoCaso[] = [];
    for (const it of sec.items) {
      if (it.tipo === 'texto') {
        if (it.k === 'fecha' && sec.corto === 'Usuario') {
          datos.push({ label: 'N.º de asesoría', valor: dato(v.asesoria_no) });
        }
        const largo = it.k.startsWith('sintesis_hecho_');
        const valor = largo ? hecho(Number(it.k.split('_')[2])) : v[it.k];
        datos.push({ label: it.label, valor: dato(valor), largo });
      } else if (it.tipo === 'opciones') {
        datos.push({ label: it.label, valor: marcadas(it.opciones), largo: it.opciones.length > 6 });
      } else {
        const resp = siNo(it.kSi, it.kNo);
        datos.push({ label: it.label, valor: resp });
        if (resp === 'Sí') {
          it.detalle?.forEach((d) => datos.push({ label: d.label, valor: dato(v[d.k]) }));
          if (it.subopciones) datos.push({ label: it.subopciones.label, valor: marcadas(it.subopciones.opciones) });
        }
      }
    }
    return { titulo: sec.titulo, datos };
  });
}

// ───────── Para editar una asesoría ya guardada (pantalla de Asignación) ─────────

// Convierte lo guardado en la base de datos en los valores que usa el formulario:
// - las casillas guardadas con "-" (no se eligió nada) vuelven a quedar sin marcar
// - los hechos antiguos, guardados partidos en 3 líneas, se juntan en un solo texto
export function valoresParaEditar(fila: Record<string, unknown>): Valores {
  const v = valoresDesdeFila(fila);

  const casillas: string[] = [];
  for (const sec of SECCIONES) {
    for (const it of sec.items) {
      if (it.tipo === 'opciones') it.opciones.forEach((o) => casillas.push(o.k));
      else if (it.tipo === 'sino') {
        casillas.push(it.kSi, it.kNo);
        it.subopciones?.opciones.forEach((o) => casillas.push(o.k));
      }
    }
  }
  for (const k of casillas) if (v[k] === SIN_SELECCION) delete v[k];

  for (const n of HECHOS) {
    const lineas = [1, 2, 3].map((i) => v[`sintesis_hecho_${n}${i}`]).filter(Boolean);
    if (!v[`sintesis_hecho_${n}`] && lineas.length) v[`sintesis_hecho_${n}`] = lineas.join(' ');
    [1, 2, 3].forEach((i) => delete v[`sintesis_hecho_${n}${i}`]);
  }
  return v;
}

// Separa lo que se va a guardar al editar: columnas propias de "recepciones" y el JSON "detalles".
// Todo va en mayúsculas (menos el correo) y lo que quedó vacío se borra.
export function prepararEdicion(v: Valores): { columnas: Record<string, string | null>; detalles: Record<string, string> } {
  const columnas: Record<string, string | null> = {};
  const detalles: Record<string, string> = {};
  CAMPOS_INDIVIDUALES.forEach((k) => { columnas[k] = null; });
  for (const [clave, valor] of Object.entries(v)) {
    const k = norm(clave);
    const texto = (valor ?? '').trim();
    if (texto === '') continue;
    const final = aMayusculas(k, texto);
    if (CAMPOS_INDIVIDUALES.includes(k)) columnas[k] = final;
    else detalles[k] = final;
  }
  return { columnas, detalles };
}
