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
      <div className="rf-opciones">
        {opciones.map((o) => {
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
  );
}

// Pregunta SI / NO. Lo que se pase como hijo solo aparece cuando la respuesta es SI;
// al elegir NO se borran los campos indicados en `limpiar`.
export function SiNo({
  titulo, kSi, kNo, limpiar = [], children,
}: {
  titulo: string;
  kSi: string;
  kNo: string;
  limpiar?: string[];
  children?: ReactNode;
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
        <div className="rf-opciones">
          <label className={`rf-opcion${si ? ' marcada' : ''}`}>
            <input type="checkbox" checked={si} onChange={() => elegir('si')} />
            <span>SI</span>
          </label>
          <label className={`rf-opcion${no ? ' marcada' : ''}`}>
            <input type="checkbox" checked={no} onChange={() => elegir('no')} />
            <span>NO</span>
          </label>
        </div>
      </div>
      {si && children && <div className="rf-sino-detalle">{children}</div>}
    </div>
  );
}
