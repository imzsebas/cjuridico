'use client';

import { ReactNode, useEffect, useRef } from 'react';

// Ventanas abiertas, de la de abajo a la de arriba: Escape solo cierra la de arriba.
const abiertas: object[] = [];

// Estructura común de todas las ventanas modales:
//   fondo oscuro (tocarlo cierra) > tarjeta > cuerpo + [pie] + botones.
// `onFuera` se ejecuta al tocar el fondo o al presionar Escape; si no se pasa, la ventana solo se cierra con sus botones.
export default function Modal({
  clase = '',
  onFuera,
  acciones,
  compactas = true,
  pie,
  children,
}: {
  clase?: string; // tamaño: 'modal-card-ancho', 'modal-card-grande', 'modal-card-medio modal-card-holgado'…
  onFuera?: () => void;
  acciones?: ReactNode;
  compactas?: boolean;
  pie?: ReactNode; // algo que va entre el cuerpo y los botones (p. ej. un error)
  children: ReactNode;
}) {
  const fuera = useRef(onFuera);
  useEffect(() => { fuera.current = onFuera; });

  useEffect(() => {
    const yo = {};
    abiertas.push(yo);
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abiertas[abiertas.length - 1] === yo) fuera.current?.();
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
      abiertas.splice(abiertas.indexOf(yo), 1);
    };
  }, []);

  return (
    <div className="modal-overlay" onClick={onFuera}>
      <div className={clase ? `modal-card ${clase}` : 'modal-card'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-cuerpo">{children}</div>
        {pie}
        <div className={compactas ? 'modal-acciones modal-acciones-compactas' : 'modal-acciones'}>{acciones}</div>
      </div>
    </div>
  );
}
