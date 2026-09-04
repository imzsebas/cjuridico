'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar

const ENLACES = [
  { href: '/recepcion', label: 'Recepción' },
  { href: '/asignacion', label: 'Asignación' },
  { href: '/libro-asesorias', label: 'Libro de asesorías' },
  { href: '/estudiantes', label: 'Estudiantes' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [esAdmin, setEsAdmin] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) setListo(true); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      setEsAdmin(perfil?.rol === 'administrador');
      setListo(true);
    }
    verificar();
    return () => { cancelado = true; };
  }, []);

  // Mientras verifica, o si no es administrador, no ocupa espacio en la página
  if (!listo || !esAdmin) return null;

  return (
    <aside className="panel-sidebar">
      <div className="panel-sidebar-brand">
        <span className="panel-sidebar-brand-nombre">Consultorio Jurídico Unicordoba</span>
      </div>
      <nav>
        {ENLACES.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className={pathname === enlace.href ? 'activo' : ''}
          >
            {enlace.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}