'use client';

import { createContext, ReactNode, useContext } from 'react';
import type { Valores } from '@/lib/formatoRecepcion';

// Los valores del formulario usan como llave el mismo nombre del campo del PDF.
// Las casillas marcadas guardan "X" (así se imprimen en el formato).
type Contexto = {
  valores: Valores;
  set: (k: string, v: string) => void;
  setVarios: (cambios: Valores) => void;
};

const FormContext = createContext<Contexto>({ valores: {}, set: () => {}, setVarios: () => {} });
export const FormProvider = FormContext.Provider;
export const useFormulario = () => useContext(FormContext);

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rf-seccion">
      <h3 className="rf-seccion-titulo">{titulo}</h3>
      <div className="rf-cuerpo">{children}</div>
    </section>
  );
}

// Bloque con título pequeño que agrupa campos relacionados dentro de una sección
export function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rf-tarjeta">
      <div className="rf-tarjeta-titulo">{titulo}</div>
      <div className="rf-tarjeta-cuerpo">{children}</div>
    </div>
  );
}

export function Fila({ children, columnas }: { children: ReactNode; columnas?: string }) {
  return (
    <div className="rf-fila" style={columnas ? { gridTemplateColumns: columnas } : undefined}>
      {children}
    </div>
  );
}

export function Texto({
  k, label, tipo = 'text', placeholder, soloLectura = false, inputMode,
}: {
  k: string;
  label: string;
  tipo?: 'text' | 'date' | 'time' | 'number' | 'email' | 'tel';
  placeholder?: string;
  soloLectura?: boolean;
  inputMode?: 'numeric' | 'tel' | 'decimal' | 'text';
}) {
  const { valores, set } = useFormulario();
  return (
    <div className="rf-campo">
      <label htmlFor={`rf-${k}`}>{label}</label>
      <input
        id={`rf-${k}`}
        type={tipo}
        value={valores[k] ?? ''}
        placeholder={placeholder}
        readOnly={soloLectura}
        inputMode={inputMode}
        min={tipo === 'number' ? 0 : undefined}
        onChange={(e) => set(k, e.target.value)}
      />
    </div>
  );
}

// Combo box: lista desplegable con opciones fijas
export function Lista({
  k, label, opciones, placeholder = 'Seleccione una opción',
}: {
  k: string;
  label: string;
  opciones: string[];
  placeholder?: string;
}) {
  const { valores, set } = useFormulario();
  return (
    <div className="rf-campo">
      <label htmlFor={`rf-${k}`}>{label}</label>
      <select id={`rf-${k}`} value={valores[k] ?? ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">{placeholder}</option>
        {/* Si el caso trae un valor que no está en la lista (registros antiguos), se muestra también */}
        {valores[k] && !opciones.includes(valores[k]) && <option value={valores[k]}>{valores[k]}</option>}
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// Combo box para opciones de elección única que se guardan como varias llaves ('X' en la elegida).
// `nombres` permite mostrar un nombre más completo que la etiqueta corta (p. ej. "CC" → "Cédula de ciudadanía").
export function ListaClaves({
  label, opciones, placeholder = 'Seleccione una opción', nombres,
}: {
  label?: string;
  opciones: { k: string; label: string }[];
  placeholder?: string;
  nombres?: Record<string, string>;
}) {
  const { valores, setVarios } = useFormulario();
  // Si un registro antiguo trae varias marcadas, se muestra la primera hasta que se cambie
  const actual = opciones.find((o) => Boolean(valores[o.k]))?.k ?? '';
  const id = `rf-lista-${opciones[0]?.k ?? 'x'}`;

  function elegir(k: string) {
    const cambios: Valores = {};
    opciones.forEach((o) => { cambios[o.k] = ''; });
    if (k) cambios[k] = 'X';
    setVarios(cambios);
  }

  return (
    <div className="rf-campo">
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} aria-label={label ? undefined : placeholder} value={actual} onChange={(e) => elegir(e.target.value)}>
        <option value="">{placeholder}</option>
        {opciones.map((o) => <option key={o.k} value={o.k}>{nombres?.[o.label] ?? o.label}</option>)}
      </select>
    </div>
  );
}

// Casilla independiente (se pueden marcar varias)
export function Casilla({ k, label }: { k: string; label: string }) {
  const { valores, set } = useFormulario();
  const marcada = Boolean(valores[k]);
  return (
    <label className={`rf-opcion${marcada ? ' marcada' : ''}`}>
      <input type="checkbox" checked={marcada} onChange={(e) => set(k, e.target.checked ? 'X' : '')} />
      <span>{label}</span>
    </label>
  );
}

// Botón tipo píldora para opciones de elección única
export function Segmento({ marcada, onClick, children }: { marcada: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      className={`rf-segmento${marcada ? ' marcada' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Grupo de opciones donde solo se puede elegir una (volver a tocarla la desmarca)
export function GrupoUnico({ titulo, opciones }: { titulo?: string; opciones: { k: string; label: string }[] }) {
  const { valores, setVarios } = useFormulario();
  function alternar(k: string) {
    const cambios: Valores = {};
    opciones.forEach((o) => { cambios[o.k] = ''; });
    if (!valores[k]) cambios[k] = 'X';
    setVarios(cambios);
  }
  return (
    <div className="rf-grupo">
      {titulo && <div className="rf-grupo-titulo">{titulo}</div>}
      <div className="rf-segmentos" role="radiogroup" aria-label={titulo}>
        {opciones.map((o) => (
          <Segmento key={o.k} marcada={Boolean(valores[o.k])} onClick={() => alternar(o.k)}>
            {o.label}
          </Segmento>
        ))}
      </div>
    </div>
  );
}

// Pregunta SI / NO. Lo que se pase como hijo solo aparece cuando la respuesta es SI;
// al elegir NO se borran los campos indicados en `limpiar`.
export function SiNo({
  titulo, kSi, kNo, limpiar = [], children, enLinea,
}: {
  titulo: string;
  kSi: string;
  kNo: string;
  limpiar?: string[];
  children?: ReactNode;
  enLinea?: ReactNode; // aparece en la misma fila de la pregunta cuando la respuesta es SI
}) {
  const { valores, setVarios } = useFormulario();
  const si = Boolean(valores[kSi]);
  const no = Boolean(valores[kNo]);

  function elegir(respuesta: 'si' | 'no') {
    const actual = respuesta === 'si' ? si : no;
    const cambios: Valores = { [kSi]: '', [kNo]: '' };
    if (!actual) cambios[respuesta === 'si' ? kSi : kNo] = 'X';
    if (!(respuesta === 'si' && !actual)) limpiar.forEach((k) => { cambios[k] = ''; });
    setVarios(cambios);
  }

  return (
    <div className="rf-sino">
      <div className="rf-sino-cabecera">
        <span className="rf-sino-titulo">{titulo}</span>
        {si && enLinea && <div className="rf-sino-extra">{enLinea}</div>}
        <div className="rf-segmentos" role="radiogroup" aria-label={titulo}>
          <Segmento marcada={si} onClick={() => elegir('si')}>SI</Segmento>
          <Segmento marcada={no} onClick={() => elegir('no')}>NO</Segmento>
        </div>
      </div>
      {si && children && <div className="rf-sino-detalle">{children}</div>}
    </div>
  );
}