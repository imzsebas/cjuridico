import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SIN_FILTROS, aplicarFiltros, hayFiltros, ordenarPorNumero, parsearFecha, periodoDe, type Registro } from '@/lib/asesorias';
import { momentoActual, siguienteTurno, textoSiguienteTurno } from '@/lib/turnos';

describe('periodo académico', () => {
  it('entiende fechas largas y cortas', () => {
    expect(parsearFecha('22/10/2026')).toEqual({ anio: 2026, periodo: 'II' });
    expect(parsearFecha('2/3/26')).toEqual({ anio: 2026, periodo: 'I' });
    expect(parsearFecha(' 30/06/2025 ')).toEqual({ anio: 2025, periodo: 'I' });
  });

  it('rechaza fechas no válidas', () => {
    expect(parsearFecha('2026-10-22')).toBeNull();
    expect(parsearFecha('1/13/2026')).toBeNull();
    expect(parsearFecha(null)).toBeNull();
  });

  it('periodoDe da el texto de la columna', () => {
    expect(periodoDe('01/07/2026')).toBe('2026-II');
    expect(periodoDe('sin fecha')).toBeNull();
  });
});

describe('ordenarPorNumero', () => {
  it('ordena como número aunque esté guardado como texto', () => {
    const r = (n: string | null) => ({ asesoria_no: n }) as Registro;
    expect(ordenarPorNumero([r('98'), r('161'), r('5')]).map((x) => x.asesoria_no)).toEqual(['161', '98', '5']);
  });
});

describe('aplicarFiltros', () => {
  // Consulta falsa que anota lo que se le pide
  const consultaFalsa = () => {
    const llamadas: string[] = [];
    const q = {
      llamadas,
      or(f: string) { llamadas.push(`or ${f}`); return q; },
      eq(c: string, v: string) { llamadas.push(`eq ${c}=${v}`); return q; },
    };
    return q;
  };

  it('sin filtros no toca la consulta', () => {
    const q = consultaFalsa();
    aplicarFiltros(q, SIN_FILTROS);
    expect(q.llamadas).toEqual([]);
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
  });

  it('busca el texto en número, nombre y cédula, y filtra por área y periodo', () => {
    const q = consultaFalsa();
    aplicarFiltros(q, { texto: 'pérez', area: 'DERECHO PENAL', periodo: '2026-II' });
    expect(q.llamadas).toEqual([
      'or asesoria_no.ilike."*pérez*",nombres_apellidos.ilike."*pérez*",cedula_numero.ilike."*pérez*"',
      'eq area_derecho=DERECHO PENAL',
      'eq periodo=2026-II',
    ]);
  });

  it('quita los caracteres que romperían la búsqueda', () => {
    const q = consultaFalsa();
    aplicarFiltros(q, { ...SIN_FILTROS, texto: 'a,b(c)"d*%' });
    expect(q.llamadas[0]).toBe('or asesoria_no.ilike."*a b c  d*",nombres_apellidos.ilike."*a b c  d*",cedula_numero.ilike."*a b c  d*"');
  });
});

describe('consultarOrdenado', () => {
  beforeEach(() => vi.resetModules()); // el módulo recuerda si falta la columna: cada prueba empieza de cero

  it('ordena por asesoria_num cuando la columna existe', async () => {
    const { consultarOrdenado } = await import('@/lib/asesorias');
    const columnas: string[] = [];
    await consultarOrdenado(async (c) => { columnas.push(c); return { data: [], error: null, count: 0 }; });
    expect(columnas).toEqual(['asesoria_num']);
  });

  it('si la base aún no tiene asesoria_num, usa el orden anterior y lo recuerda', async () => {
    const { consultarOrdenado } = await import('@/lib/asesorias');
    const columnas: string[] = [];
    const pedir = async (c: 'asesoria_num' | 'asesoria_no') => {
      columnas.push(c);
      return c === 'asesoria_num'
        ? { data: null, error: { code: '42703', message: 'column asesoria_num does not exist' }, count: null }
        : { data: [{ id: 1 }], error: null, count: 1 };
    };
    expect((await consultarOrdenado(pedir)).data).toEqual([{ id: 1 }]);
    await consultarOrdenado(pedir);
    expect(columnas).toEqual(['asesoria_num', 'asesoria_no', 'asesoria_no']);
  });
});

describe('turnos (hora de Colombia)', () => {
  // Las fechas van en UTC; Colombia es UTC-5
  const colombia = (iso: string) => new Date(`${iso}-05:00`);

  it('reconoce el turno en curso', () => {
    expect(momentoActual(colombia('2026-10-21T08:00:00'))).toEqual({ dia: 3, turno: 1 });
    expect(momentoActual(colombia('2026-10-21T11:59:00'))).toEqual({ dia: 3, turno: 2 });
    expect(momentoActual(colombia('2026-10-21T15:30:00'))).toEqual({ dia: 3, turno: 3 });
  });

  it('sin turno en almuerzo, fuera de horario y fines de semana', () => {
    expect(momentoActual(colombia('2026-10-21T12:30:00')).turno).toBeNull();
    expect(momentoActual(colombia('2026-10-21T16:00:00')).turno).toBeNull();
    expect(momentoActual(colombia('2026-10-24T09:00:00')).turno).toBeNull(); // sábado
  });

  it('calcula el siguiente turno', () => {
    expect(siguienteTurno(colombia('2026-10-21T12:30:00'))).toEqual({ dia: 3, turno: 3 });
    expect(siguienteTurno(colombia('2026-10-23T17:00:00'))).toEqual({ dia: 1, turno: 1 }); // viernes tarde → lunes
    expect(textoSiguienteTurno(colombia('2026-10-23T17:00:00'))).toBe('el lunes (8:00 a. m. – 10:00 a. m.)');
    expect(textoSiguienteTurno(colombia('2026-10-21T12:30:00'))).toBe('hoy (2:00 p. m. – 4:00 p. m.)');
  });
});
