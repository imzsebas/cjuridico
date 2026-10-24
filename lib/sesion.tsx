'use client';

// Sesión y rol del usuario, consultados UNA sola vez en PanelLayout y compartidos con todas las pantallas.
// Antes cada página volvía a pedir la sesión y el rol por su cuenta.
//
// OJO: esto solo decide qué se muestra y a dónde se redirige. Lo que de verdad protege los datos
// son las políticas RLS de Supabase.

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

export type Sesion = { userId: string; correo: string; rol: string | null };

// undefined = todavía cargando · null = no hay sesión
const ContextoSesion = createContext<Sesion | null | undefined>(undefined);
export const ProveedorSesion = ContextoSesion.Provider;

// Devuelve la sesión solo si el rol está permitido; si no, redirige.
// `destino` dice a dónde se manda a quien no tiene permiso (puede depender de su rol).
export function usePermiso(roles: string[], destino: string | ((rol: string | null) => string) = '/login'): Sesion | null {
  const sesion = useContext(ContextoSesion);
  const router = useRouter();
  const permitido = !!sesion && sesion.rol !== null && roles.includes(sesion.rol);
  const redirigirA =
    sesion === undefined || permitido ? null
    : sesion === null ? '/login'
    : typeof destino === 'string' ? destino : destino(sesion.rol);

  useEffect(() => {
    if (redirigirA) router.replace(redirigirA);
  }, [redirigirA, router]);

  return permitido ? sesion : null;
}

// Reloj que cambia cada minuto (para saber el turno en curso).
// En el servidor (y en el primer render del navegador) vale null: así el HTML pre-generado
// no trae una hora vieja que luego no coincide (eso causaba el error #418 de React en Calendario).
const suscribirMinuto = (aviso: () => void) => {
  const t = setInterval(aviso, 15_000);
  return () => clearInterval(t);
};
const minutoActual = () => Math.floor(Date.now() / 60_000);

export function useAhora(): Date | null {
  const minuto = useSyncExternalStore(suscribirMinuto, minutoActual, () => null);
  return minuto === null ? null : new Date(minuto * 60_000);
}
