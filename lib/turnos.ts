// Turnos del consultorio (lunes a viernes) y utilidades para saber qué turno es "ahora".
// Si algún día cambian las horas o los días, se editan solo aquí.

export type Turno = { id: number; inicio: string; fin: string; etiqueta: string };
export type Dia = { id: number; nombre: string; corto: string };

export const TURNOS: Turno[] = [
  { id: 1, inicio: '08:00', fin: '10:00', etiqueta: '8:00 a. m. – 10:00 a. m.' },
  { id: 2, inicio: '10:00', fin: '12:00', etiqueta: '10:00 a. m. – 12:00 m.' },
  { id: 3, inicio: '14:00', fin: '16:00', etiqueta: '2:00 p. m. – 4:00 p. m.' },
];

// 1 = lunes ... 5 = viernes (igual que la columna "dia" de la tabla horarios_estudiantes)
export const DIAS: Dia[] = [
  { id: 1, nombre: 'Lunes', corto: 'Lun' },
  { id: 2, nombre: 'Martes', corto: 'Mar' },
  { id: 3, nombre: 'Miércoles', corto: 'Mié' },
  { id: 4, nombre: 'Jueves', corto: 'Jue' },
  { id: 5, nombre: 'Viernes', corto: 'Vie' },
];

const ZONA = 'America/Bogota';
const DIA_POR_ABREVIATURA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Día de la semana (0 = domingo ... 6 = sábado) y minutos desde la medianoche, en hora de Colombia,
// sin importar la zona horaria del computador.
function relojColombia(fecha: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return {
    dia: DIA_POR_ABREVIATURA[valor('weekday')] ?? 0,
    minutos: (Number(valor('hour')) % 24) * 60 + Number(valor('minute')),
  };
}

export type Momento = {
  dia: number;            // 0-6 (domingo-sábado), hora de Colombia
  turno: number | null;   // id del turno en curso, o null si no hay ninguno
};

// ¿Qué turno está en curso en este momento? (null = fuera de horario, almuerzo, fin de semana)
export function momentoActual(fecha: Date = new Date()): Momento {
  const { dia, minutos } = relojColombia(fecha);
  if (dia < 1 || dia > 5) return { dia, turno: null };
  const t = TURNOS.find((x) => minutos >= aMinutos(x.inicio) && minutos < aMinutos(x.fin));
  return { dia, turno: t ? t.id : null };
}

export function etiquetaTurno(id: number): string {
  return TURNOS.find((t) => t.id === id)?.etiqueta ?? '';
}

export function nombreDia(id: number): string {
  return DIAS.find((d) => d.id === id)?.nombre ?? '';
}

// Próximo turno a partir de ahora (puede ser hoy mismo o un día siguiente)
export function siguienteTurno(fecha: Date = new Date()): { dia: number; turno: number } | null {
  const { dia, minutos } = relojColombia(fecha);
  for (let salto = 0; salto <= 7; salto++) {
    const d = (dia + salto) % 7;
    if (d < 1 || d > 5) continue;
    const t = TURNOS.find((x) => salto > 0 || aMinutos(x.inicio) > minutos);
    if (t) return { dia: d, turno: t.id };
  }
  return null;
}

// Texto corto: "hoy a las 2:00 p. m. – 4:00 p. m." o "el martes (8:00 a. m. – 10:00 a. m.)"
export function textoSiguienteTurno(fecha: Date = new Date()): string {
  const sig = siguienteTurno(fecha);
  if (!sig) return '';
  const hoy = relojColombia(fecha).dia;
  const cuando = sig.dia === hoy ? 'hoy' : `el ${nombreDia(sig.dia).toLowerCase()}`;
  return `${cuando} (${etiquetaTurno(sig.turno)})`;
}
