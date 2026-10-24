import { describe, expect, it } from 'vitest';
import { difNumerica, formatearFecha, mensajeDe, normalizar, traerTodo, uno } from '@/lib/utilidades';
import { etiquetaNivel, nivelRomano } from '@/lib/niveles';
import { generarPassword } from '@/lib/apiMonitores';
import { rutaDePdf } from '@/lib/pdfPrivado';

describe('utilidades', () => {
  it('normalizar quita tildes, mayúsculas y espacios', () => {
    expect(normalizar('  Álvarez PÉREZ ')).toBe('alvarez perez');
    expect(normalizar(null)).toBe('');
  });

  it('formatearFecha pasa AAAA-MM-DD a DD/MM/AAAA', () => {
    expect(formatearFecha('2026-10-23')).toBe('23/10/2026');
    expect(formatearFecha('2026-10-23T15:00:00Z')).toBe('23/10/2026');
    expect(formatearFecha(null)).toBe('—');
  });

  it('difNumerica compara números guardados como texto', () => {
    expect(difNumerica('161', '98')).toBeGreaterThan(0);
    expect(difNumerica('A-1', '98')).toBe(0);
  });

  it('uno devuelve siempre un objeto', () => {
    expect(uno([{ a: 1 }])).toEqual({ a: 1 });
    expect(uno({ a: 1 })).toEqual({ a: 1 });
    expect(uno([])).toBeNull();
    expect(uno(null)).toBeNull();
  });

  it('mensajeDe entiende errores de JavaScript y de Supabase', () => {
    expect(mensajeDe(new Error('falló'))).toBe('falló');
    expect(mensajeDe({ message: 'de supabase' })).toBe('de supabase');
    expect(mensajeDe('raro', 'por defecto')).toBe('por defecto');
  });

  it('traerTodo pide bloque tras bloque hasta el final', async () => {
    const datos = Array.from({ length: 2503 }, (_, i) => i);
    const pedidos: [number, number][] = [];
    const todo = await traerTodo<number>(async (desde, hasta) => {
      pedidos.push([desde, hasta]);
      return { data: datos.slice(desde, hasta + 1), error: null };
    });
    expect(todo).toHaveLength(2503);
    expect(pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('traerTodo lanza el error de la consulta', async () => {
    await expect(traerTodo(async () => ({ data: null, error: { message: 'sin permiso' } }))).rejects.toThrow('sin permiso');
  });
});

describe('niveles', () => {
  it('muestra el nivel en romanos', () => {
    expect(nivelRomano('DERECHO PUBLICO')).toBe('I');
    expect(nivelRomano(' derecho penal ')).toBe('IV');
    expect(nivelRomano('OTRO')).toBe('OTRO');
    expect(etiquetaNivel('DERECHO LABORAL')).toBe('Nivel III');
  });
});

describe('generarPassword', () => {
  it('genera contraseñas del largo pedido, sin caracteres que se confunden', () => {
    for (let i = 0; i < 50; i++) {
      const p = generarPassword(12);
      expect(p).toHaveLength(12);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
});

describe('rutaDePdf', () => {
  it('saca la ruta dentro del bucket de las URL viejas y nuevas', () => {
    expect(rutaDePdf('recepcion-1.pdf')).toBe('recepcion-1.pdf');
    expect(rutaDePdf('https://x.supabase.co/storage/v1/object/public/recepciones/recepcion%20dos.pdf?t=1')).toBe('recepcion dos.pdf');
    expect(rutaDePdf(null)).toBe('');
  });
});
