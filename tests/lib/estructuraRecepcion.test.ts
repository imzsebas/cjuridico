import { beforeAll, describe, expect, it } from 'vitest';
import { crearMedidor, type Medidor } from '@/lib/formatoRecepcion';
import {
  SECCIONES, SIN_SELECCION, SIN_TEXTO, completarEnBlanco, hechoQueNoCabe, prepararEdicion, repartoDe, resumenCaso,
  revisarFormulario, valoresParaEditar,
} from '@/lib/estructuraRecepcion';

describe('revisarFormulario', () => {
  it('con el formulario vacío, todas las secciones tienen espacios sin llenar', () => {
    const faltan = revisarFormulario({});
    expect(faltan).toHaveLength(SECCIONES.length);
    faltan.forEach((lista) => expect(lista.length).toBeGreaterThan(0));
  });

  it('un campo lleno deja de aparecer como faltante', () => {
    expect(revisarFormulario({})[0]).toContain('Nombre y apellido según documento de identidad');
    expect(revisarFormulario({ nombres_apellidos: 'ANA' })[0]).not.toContain('Nombre y apellido según documento de identidad');
  });

  it('un grupo de casillas cuenta como lleno con una sola marcada', () => {
    expect(revisarFormulario({ documento_cc: 'X' })[0]).not.toContain('Tipo de identificación');
  });

  it('la unión marital de hecho solo se pide a personas solteras', () => {
    const personal = 3;
    expect(revisarFormulario({ estado_civil_casado: 'X' })[personal]).not.toContain('Unión marital de hecho');
    expect(revisarFormulario({ estado_civil_soltero: 'X' })[personal]).toContain('Unión marital de hecho');
  });

  it('el detalle de un SI/NO solo se pide cuando la respuesta es SI', () => {
    const bienes = 2;
    expect(revisarFormulario({ vehiculo_no: 'X' })[bienes]).not.toContain('Vehículo: Placa');
    expect(revisarFormulario({ vehiculo_si: 'X' })[bienes]).toContain('Vehículo: Placa');
  });

  it('el tipo de discapacidad se pide solo si respondió SI', () => {
    expect(revisarFormulario({ discapacidad_no: 'X' })[0]).not.toContain('Tipo de discapacidad');
    expect(revisarFormulario({ discapacidad_si: 'X' })[0]).toContain('Tipo de discapacidad');
  });
});

describe('completarEnBlanco', () => {
  it('rellena textos con N/A y grupos sin elegir con "-"', () => {
    const r = completarEnBlanco({ nombres_apellidos: 'ANA', documento_cc: 'X' });
    expect(r.nombres_apellidos).toBe('ANA');
    expect(r.correo).toBe(SIN_TEXTO);
    expect(r.documento_cc).toBe('X');
    expect(r.documento_ti).toBeUndefined(); // el grupo ya tenía una marcada
    expect(r.escolaridad_primaria).toBe(SIN_SELECCION);
    expect(r.vehiculo_si).toBe(SIN_SELECCION);
    expect(r.vehiculo_no).toBe(SIN_SELECCION);
  });

  it('no modifica el objeto original', () => {
    const original = { nombres_apellidos: 'ANA' };
    completarEnBlanco(original);
    expect(original).toEqual({ nombres_apellidos: 'ANA' });
  });

  it('los rellenos (N/A y "-") siguen contando como espacios sin llenar', () => {
    const relleno = completarEnBlanco({});
    expect(revisarFormulario(relleno)[0]).toContain('Correo electrónico');
    expect(revisarFormulario(relleno)[0]).toContain('Tipo de identificación');
  });
});

describe('valoresParaEditar', () => {
  it('desmarca las casillas guardadas con "-" y junta los hechos antiguos', () => {
    const v = valoresParaEditar({
      nombres_apellidos: 'ANA',
      detalles: { documento_cc: '-', documento_ti: 'X', sintesis_hecho_11: 'PRIMERA', sintesis_hecho_12: 'SEGUNDA' },
    });
    expect(v.documento_cc).toBeUndefined();
    expect(v.documento_ti).toBe('X');
    expect(v.sintesis_hecho_1).toBe('PRIMERA SEGUNDA');
    expect(v.sintesis_hecho_11).toBeUndefined();
  });
});

describe('prepararEdicion', () => {
  it('separa columnas propias y detalles, en mayúsculas salvo el correo', () => {
    const { columnas, detalles } = prepararEdicion({
      nombres_apellidos: ' ana ',
      correo: 'Ana@Mail.com',
      estrato: '2',
      documento_cc: 'X',
      ciudad_vacia: '   ',
    });
    expect(columnas.nombres_apellidos).toBe('ANA');
    expect(columnas.correo).toBe('Ana@Mail.com');
    expect(columnas.cedula_numero).toBeNull(); // las columnas sin dato se borran
    expect(detalles).toEqual({ estrato: '2', documento_cc: 'X' });
  });
});

describe('repartoDe', () => {
  it('lee la casilla con / sin reparto', () => {
    expect(repartoDe({ asesoria_con_reparto: true })).toBe('Sí');
    expect(repartoDe({ asesoria_sin_reparto: 'X' })).toBe('No');
    expect(repartoDe({})).toBeNull();
  });
});

describe('resumenCaso', () => {
  it('devuelve las 6 secciones con los datos del caso', () => {
    const secciones = resumenCaso({ asesoria_no: '77', nombres_apellidos: 'ANA', detalles: { documento_cc: true } });
    expect(secciones).toHaveLength(6);
    const usuario = secciones[0].datos;
    expect(usuario.find((d) => d.label === 'N.º de asesoría')?.valor).toBe('77');
    expect(usuario.find((d) => d.label === 'Tipo de identificación')?.valor).toBe('CC');
    expect(usuario.find((d) => d.label === 'Correo electrónico')?.valor).toBe('—');
  });
});

describe('hechoQueNoCabe', () => {
  // La fuente del PDF se carga una sola vez (es lo lento) y se reutiliza
  let medidor: Medidor;
  beforeAll(async () => { medidor = await crearMedidor(); });

  it('devuelve el primer hecho que no cabe en el formato', async () => {
    expect(await hechoQueNoCabe({ sintesis_hecho_1: 'Corto' }, medidor)).toBeNull();
    expect(await hechoQueNoCabe({ sintesis_hecho_1: 'Corto', sintesis_hecho_2: 'palabra '.repeat(200) }, medidor)).toBe(2);
  });
});
