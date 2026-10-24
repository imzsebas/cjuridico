import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFTextField } from 'pdf-lib';
import {
  aMayusculas, crearMedidor, generarPdfRecepcion, hechoCompleto, limpiarTexto, partirEnLineas, valoresDesdeFila,
} from '@/lib/formatoRecepcion';

// Medidor simple para las pruebas: cada carácter mide 1
const porLetras = (t: string) => t.length;

describe('limpiarTexto', () => {
  it('cambia los caracteres que la fuente del PDF no puede dibujar', () => {
    expect(limpiarTexto('“Hola” ‘mundo’ – fin…')).toBe('"Hola" \'mundo\' - fin...');
    expect(limpiarTexto('línea\nnueva')).toBe('línea nueva');
    expect(limpiarTexto('emoji 😀')).toBe('emoji ??');
  });

  it('conserva tildes y eñes', () => {
    expect(limpiarTexto('Peñalosa, José, ÁÉÍÓÚ')).toBe('Peñalosa, José, ÁÉÍÓÚ');
  });
});

describe('partirEnLineas', () => {
  it('reparte las palabras en las líneas disponibles', () => {
    expect(partirEnLineas('uno dos tres cuatro', porLetras, [8, 8, 8])).toEqual({
      lineas: ['uno dos', 'tres', 'cuatro'],
      desborde: false,
    });
  });

  it('avisa cuando el texto no cabe', () => {
    expect(partirEnLineas('uno dos tres cuatro cinco', porLetras, [8, 8]).desborde).toBe(true);
  });

  it('corta una palabra más larga que la línea', () => {
    expect(partirEnLineas('abcdefghij', porLetras, [4, 4, 4]).lineas).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('ignora espacios de sobra', () => {
    expect(partirEnLineas('  uno    dos  ', porLetras, [20]).lineas).toEqual(['uno dos']);
  });

  it('con el medidor real, un hecho corto cabe y uno muy largo no', async () => {
    const medir = await crearMedidor();
    expect(partirEnLineas('EL USUARIO SOLICITA ORIENTACIÓN.', medir).desborde).toBe(false);
    expect(partirEnLineas('PALABRA '.repeat(200), medir).desborde).toBe(true);
  });
});

describe('aMayusculas', () => {
  it('pasa a mayúsculas todo menos el correo', () => {
    expect(aMayusculas('nombres_apellidos', 'juan pérez')).toBe('JUAN PÉREZ');
    expect(aMayusculas('correo', 'Juan@Mail.com')).toBe('Juan@Mail.com');
  });
});

describe('valoresDesdeFila', () => {
  it('junta columnas y detalles; true se vuelve X y lo vacío se omite', () => {
    const v = valoresDesdeFila({
      asesoria_no: '12',
      nombres_apellidos: 'ANA',
      cedula_numero: null,
      detalles: { documento_cc: true, discapacidad_no: false, 'ingresos mensuales': '1000' },
    });
    expect(v).toEqual({ asesoria_no: '12', nombres_apellidos: 'ANA', documento_cc: 'X', ingresos_mensuales: '1000' });
  });

  it('tolera una fila sin detalles', () => {
    expect(valoresDesdeFila({ asesoria_no: '1', detalles: null })).toEqual({ asesoria_no: '1' });
  });
});

describe('hechoCompleto', () => {
  it('usa el hecho completo si existe', () => {
    expect(hechoCompleto({ sintesis_hecho_1: 'NUEVO' }, 1)).toBe('NUEVO');
  });

  it('junta las 3 líneas de los registros antiguos', () => {
    expect(hechoCompleto({ sintesis_hecho_21: 'A', sintesis_hecho_22: 'B', sintesis_hecho_23: 'C' }, 2)).toBe('A B C');
  });
});

describe('generarPdfRecepcion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('llena el formato con los datos, en mayúsculas salvo el correo', async () => {
    const plantilla = readFileSync('public/formato-recepcion.pdf');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(plantilla)));

    const bytes = await generarPdfRecepcion({
      asesoria_no: '150',
      nombres_apellidos: 'maría gómez',
      correo: 'Maria@Correo.com',
      sintesis_hecho_1: 'la usuaria solicita orientación sobre la cuota alimentaria',
      asesoria_con_reparto: 'X',
    });

    const form = (await PDFDocument.load(bytes)).getForm();
    const texto = (nombre: string) => (form.getField(nombre) as PDFTextField).getText();
    expect(texto('asesoria_no')).toBe('150');
    expect(texto('nombres_apellidos')).toBe('MARÍA GÓMEZ');
    expect(texto('correo')).toBe('Maria@Correo.com');
    expect(texto('sintesis_hecho_11')).toBe('LA USUARIA SOLICITA ORIENTACIÓN SOBRE LA CUOTA ALIMENTARIA');
  });

  it('avisa si no encuentra la plantilla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })));
    await expect(generarPdfRecepcion({})).rejects.toThrow('No se encontró el formato PDF');
  });
});
