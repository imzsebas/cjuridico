// Niveles del consultorio. En la base de datos se guarda el nombre del área
// (DERECHO PUBLICO, etc.); en pantalla, cuando se habla del NIVEL, se muestra en romanos.

export const NIVELES = ['DERECHO PUBLICO', 'DERECHO PRIVADO', 'DERECHO LABORAL', 'DERECHO PENAL'] as const;

const ROMANO: Record<string, string> = {
  'DERECHO PUBLICO': 'I',
  'DERECHO PRIVADO': 'II',
  'DERECHO LABORAL': 'III',
  'DERECHO PENAL': 'IV',
};

// 'DERECHO PUBLICO' -> 'I'. Si llega un valor desconocido, lo devuelve tal cual.
export function nivelRomano(valor: string | null | undefined): string {
  if (!valor) return '';
  return ROMANO[valor.trim().toUpperCase()] ?? valor;
}

// 'DERECHO PUBLICO' -> 'Nivel I' (para opciones de filtros)
export function etiquetaNivel(valor: string): string {
  const r = nivelRomano(valor);
  return r === valor ? valor : `Nivel ${r}`;
}
