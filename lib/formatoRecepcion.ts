// Lógica compartida del formato de recepción: llenar el PDF a partir de los datos
// (se usa al guardar en /recepcion y al volver a descargarlo desde el libro de asesorías).

export const PDF_URL = '/formato-recepcion.pdf'; // PDF editable en /public

export type Valores = Record<string, string>;

// Estos campos se guardan como columna propia en "recepciones".
// Todo lo demás se guarda junto, como JSON, en la columna "detalles".
export const CAMPOS_INDIVIDUALES = [
  'fecha', 'asesoria_no',
  'nombres_apellidos', 'cedula_numero', 'correo', 'contacto_1',
  'direccion', 'area_derecho', 'naturaleza_asunto',
  'estudiante_recepciona_nombre', 'estudiante_recepciona_codigo',
];

// Tamaño de letra de los campos del PDF y espacio de cada hecho en la "Síntesis de los hechos":
// ahora cada hecho es UN solo cuadro de texto de varias líneas (antes eran 3 campos de una línea).
// LINEAS_HECHO = cuántas líneas caben en el cuadro; ANCHO_HECHO = ancho útil de cada línea (en puntos).
export const TAM_FUENTE = 7.994;
export const LINEAS_HECHO = 4;
export const ANCHO_HECHO = 515;
export const ANCHOS_HECHO = Array<number>(LINEAS_HECHO).fill(ANCHO_HECHO);

// Campos del PDF cuyo nombre en la plantilla no coincide con el que usa la app
// (nombre en el PDF -> nombre que usa la app). Así la plantilla funciona sin tener que renombrarlos.
const ALIAS_CAMPOS_PDF: Record<string, string> = {
  escolaridad_bachiller_2: 'escolaridad_primaria',
  escolaridad_pregrado_2: 'escolaridad_tecnico',
  ingresos_mensuales_2: 'estrato',
};

// Casillas "Con reparto / Sin reparto": en el PDF actual están dibujadas pero no tienen campo,
// así que se marcan con una X en estas coordenadas (página 2, en puntos).
const MARCAS_SIN_CAMPO: Record<string, { pagina: number; x: number; y: number }> = {
  asesoria_con_reparto: { pagina: 1, x: 164.6, y: 574.1 },
  asesoria_sin_reparto: { pagina: 1, x: 254.6, y: 574.1 },
};

// Todo el texto se guarda y se imprime en MAYÚSCULAS, excepto el correo electrónico
export const CAMPOS_SIN_MAYUSCULAS = ['correo'];
export const aMayusculas = (clave: string, valor: string) =>
  CAMPOS_SIN_MAYUSCULAS.includes(clave.trim()) ? valor : valor.toUpperCase();

// "ingresos mensuales", " poblacion_room"… -> "ingresos_mensuales", "poblacion_room"
export const norm = (s: string) => s.trim().replace(/\s+/g, '_');

// Deja solo caracteres que la fuente del PDF (Helvetica / WinAnsi) puede dibujar
export function limpiarTexto(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/[^\u0020-\u00FF]/g, '?');
}

export type Medidor = (texto: string, tam?: number) => number;

// Parte un texto en las líneas que caben en el formato. `desborde` es true si no cabe todo.
export function partirEnLineas(
  texto: string,
  medir: Medidor,
  anchos: number[] = ANCHOS_HECHO
): { lineas: string[]; desborde: boolean } {
  const palabras = limpiarTexto(texto).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  let desborde = false;

  for (let palabra of palabras) {
    while (true) {
      if (lineas.length >= anchos.length) { desborde = true; break; }
      const ancho = anchos[lineas.length];
      const candidato = actual ? `${actual} ${palabra}` : palabra;
      if (medir(candidato) <= ancho) { actual = candidato; break; }
      if (actual) { lineas.push(actual); actual = ''; continue; }
      // Una sola palabra más ancha que la línea: se corta por caracteres
      let corte = palabra.length;
      while (corte > 1 && medir(palabra.slice(0, corte)) > ancho) corte--;
      lineas.push(palabra.slice(0, corte));
      palabra = palabra.slice(corte);
      if (!palabra) break;
    }
    if (desborde) break;
  }
  if (!desborde && actual) {
    if (lineas.length < anchos.length) lineas.push(actual);
    else desborde = true;
  }
  return { lineas, desborde };
}

// Medidor de ancho de texto con la misma fuente del PDF (para avisar en pantalla si un hecho no cabe)
export async function crearMedidor(): Promise<Medidor> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  return (texto, tam = TAM_FUENTE) => fuente.widthOfTextAtSize(texto, tam);
}

// Convierte lo guardado en la base de datos (columnas + JSON "detalles") en los valores del formato
export function valoresDesdeFila(fila: Record<string, unknown>): Valores {
  const valores: Valores = {};
  const detalles = (fila.detalles && typeof fila.detalles === 'object' ? fila.detalles : {}) as Record<string, unknown>;
  const agregar = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === false) return;
    valores[norm(k)] = v === true ? 'X' : String(v);
  };
  for (const [k, v] of Object.entries(detalles)) agregar(k, v);
  for (const k of CAMPOS_INDIVIDUALES) agregar(k, fila[k]);
  return valores;
}

// Llena el PDF con los valores y devuelve el archivo listo para descargar o subir.
// Sirve igual para registros nuevos (hechos completos en "sintesis_hecho_1..5")
// y para los antiguos (líneas ya partidas en "sintesis_hecho_11", "_12"…).
export async function generarPdfRecepcion(valores: Valores): Promise<Uint8Array> {
  const { PDFDocument, PDFTextField, StandardFonts, rgb } = await import('pdf-lib');

  const respuesta = await fetch(PDF_URL);
  if (!respuesta.ok) throw new Error('No se encontró el formato PDF (public/formato-recepcion.pdf).');
  const doc = await PDFDocument.load(await respuesta.arrayBuffer());
  const form = doc.getForm();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const medir: Medidor = (t, tam = TAM_FUENTE) => fuente.widthOfTextAtSize(t, tam);

  const datos: Valores = {};
  for (const [k, v] of Object.entries(valores)) {
    const valor = v as unknown;
    if (valor === null || valor === undefined || valor === false) continue;
    datos[norm(k)] = aMayusculas(norm(k), valor === true ? 'X' : String(valor));
  }

  // Cada hecho va en su cuadro del formato (campo "sintesis_hecho_N1"), con saltos de línea ya calculados.
  // Los registros antiguos traían el hecho partido en 3 líneas (_N1, _N2, _N3): se juntan y se vuelven a acomodar.
  for (let n = 1; n <= 5; n++) {
    const completo =
      datos[`sintesis_hecho_${n}`] ??
      [1, 2, 3].map((i) => datos[`sintesis_hecho_${n}${i}`]).filter(Boolean).join(' ');
    if (!completo) continue;
    datos[`sintesis_hecho_${n}1`] = partirEnLineas(completo, medir).lineas.join('\n');
  }

  const llenados = new Set<string>();
  for (const campo of form.getFields()) {
    const nombre = norm(campo.getName());
    const clave = ALIAS_CAMPOS_PDF[nombre] ?? nombre;
    const valor = datos[clave];
    if (valor === undefined || !(campo instanceof PDFTextField)) continue;
    if (/^sintesis_hecho_\d1$/.test(clave)) {
      campo.enableMultiline(); // el cuadro del hecho es de varias líneas
      campo.setText(valor.split('\n').map(limpiarTexto).join('\n'));
    } else {
      campo.setText(limpiarTexto(valor));
    }
    llenados.add(clave);
  }

  // Casillas dibujadas en el PDF que no tienen campo: se marcan con una X
  // (o con el guion "-" si no se eligió ninguna de las dos opciones)
  const paginas = doc.getPages();
  for (const [clave, pos] of Object.entries(MARCAS_SIN_CAMPO)) {
    if (!datos[clave] || llenados.has(clave)) continue;
    const marca = datos[clave] === '-' ? '-' : 'X';
    const tam = 11;
    const ancho = fuenteNegrita.widthOfTextAtSize(marca, tam);
    paginas[pos.pagina].drawText(marca, {
      x: pos.x - ancho / 2,
      y: pos.y - tam * 0.35,
      size: tam,
      font: fuenteNegrita,
      color: rgb(0, 0, 0),
    });
  }

  return doc.save();
}

export function descargarArchivo(bytes: Uint8Array, nombre: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
}
