'use client';

import { ReactNode } from 'react';
import { NIVELES, etiquetaNivel } from '@/lib/niveles';
import { generarPassword } from '@/lib/apiMonitores';

// Campos sencillos de los modales (.field): etiqueta + entrada. Se usan en Estudiantes y Monitores.

export function Campo({
  label, valor, onCambio, tipo = 'text', id, placeholder, children,
}: {
  label: string;
  valor: string;
  onCambio: (v: string) => void;
  tipo?: 'text' | 'email';
  id?: string;
  placeholder?: string;
  children?: ReactNode; // botón al lado del campo
}) {
  const entrada = (
    <input
      id={id}
      type={tipo}
      autoComplete={children ? 'off' : undefined}
      placeholder={placeholder}
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
    />
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? <div className="cred-con-boton">{entrada}{children}</div> : entrada}
    </div>
  );
}

// Contraseña con botón "Generar"
export function CampoPassword(props: { label: string; valor: string; onCambio: (v: string) => void; id?: string; placeholder?: string }) {
  return (
    <Campo {...props}>
      <button type="button" className="btn-secundario" onClick={() => props.onCambio(generarPassword())}>
        Generar
      </button>
    </Campo>
  );
}

export function CampoNivel({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="field">
      <label>Nivel de consultorio</label>
      <select className="campo-select" value={valor} onChange={(e) => onCambio(e.target.value)}>
        {NIVELES.map((n) => <option key={n} value={n}>{etiquetaNivel(n)}</option>)}
      </select>
    </div>
  );
}
