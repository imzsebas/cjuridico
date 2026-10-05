'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Rol = 'administrador' | 'monitor' | string;

const ICONOS = {
  recepcion: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M6 6h6M6 9h6M6 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  asignacion: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M1 16c0-3.314 2.686-6 6-6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M11.5 13.5l1.5 1.5 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  libro: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><path d="M3 3.5A1.5 1.5 0 014.5 2H15v12H4.5A1.5 1.5 0 003 15.5v-12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M3 15.5A1.5 1.5 0 004.5 17H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  estudiantes: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M3 16c0-2.761 2.686-5 6-5s6 2.239 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  historial: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="M9 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
};

const ENLACES = [
  { href: '/recepcion', label: 'Recepción', corto: 'Recepción', grupo: 'Gestión', icono: ICONOS.recepcion, roles: ['administrador', 'monitor'] },
  { href: '/asignacion', label: 'Asignación', corto: 'Asignación', grupo: 'Gestión', icono: ICONOS.asignacion, roles: ['administrador'] },
  { href: '/libro-asesorias', label: 'Libro de asesorías', corto: 'Libro', grupo: 'Registros', icono: ICONOS.libro, roles: ['administrador'] },
  { href: '/estudiantes', label: 'Estudiantes', corto: 'Estudiantes', grupo: 'Registros', icono: ICONOS.estudiantes, roles: ['administrador'] },
  { href: '/mis-recepciones', label: 'Mis recepciones', corto: 'Historial', grupo: 'Registros', icono: ICONOS.historial, roles: ['monitor'] },
];

const ETIQUETA_ROL: Record<string, string> = { administrador: 'Administrador', monitor: 'Monitor' };

const IconoSalir = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [rol, setRol] = useState<Rol | null>(null);
  const [correo, setCorreo] = useState('');
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return; // cada página ya redirige a /login si no hay sesión
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      setCorreo(user.email ?? '');
      setRol(perfil?.rol ?? null);
    }
    verificar();
    return () => { cancelado = true; };
  }, []);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const items = ENLACES.filter((e) => rol !== null && e.roles.includes(rol));
  const grupos = Array.from(new Set(items.map((i) => i.grupo)));
  const activo = ENLACES.find((e) => e.href === pathname);
  const inicial = (correo.charAt(0) || '?').toUpperCase();
  const etiquetaRol = rol ? (ETIQUETA_ROL[rol] ?? rol) : '';

  return (
    <div className="panel-shell">

      {/* ── SIDEBAR (escritorio) ── */}
      <aside className="panel-sidebar">
        <div className="panel-sidebar-deco" />
        <div className="panel-logo">
          <div className="panel-logo-row">
            <div className="panel-emblem">CJ</div>
            <div>
              <div className="panel-logo-name">Consultorio Jurídico</div>
              <div className="panel-logo-sub">Unicórdoba</div>
            </div>
          </div>
        </div>

        <nav className="panel-nav">
          {grupos.map((grupo, i) => (
            <div key={grupo}>
              <span className="panel-nav-label" style={i > 0 ? { marginTop: '1rem' } : undefined}>{grupo}</span>
              {items.filter((it) => it.grupo === grupo).map((it) => (
                <Link key={it.href} href={it.href} className={`panel-nav-item ${pathname === it.href ? 'active' : ''}`}>
                  {it.icono}
                  <span className="panel-nav-text">{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="panel-sidebar-footer">
          <div className="panel-user-row">
            <div className="panel-user-avatar">{inicial}</div>
            <div style={{ minWidth: 0 }}>
              <div className="panel-user-name">{correo}</div>
              <div className="panel-user-role">{etiquetaRol}</div>
            </div>
            <button className="panel-logout-btn" onClick={cerrarSesion} title="Cerrar sesión">
              <IconoSalir />
            </button>
          </div>
        </div>
      </aside>

      {/* ── BARRA SUPERIOR (móvil) ── */}
      <div className="panel-mobile-topbar">
        <div className="panel-mobile-topbar-left">
          <div className="panel-emblem panel-emblem-sm">CJ</div>
          <div>
            <div className="panel-mobile-topbar-title">Consultorio Jurídico</div>
            <div className="panel-mobile-topbar-section">{activo?.label}</div>
          </div>
        </div>
        <div className="panel-mobile-avatar" onClick={() => setMenuAbierto(true)}>{inicial}</div>
      </div>

      {/* ── DRAWER DE USUARIO (móvil) ── */}
      <div className={`panel-drawer-overlay ${menuAbierto ? 'open' : ''}`} onClick={() => setMenuAbierto(false)} />
      <div className={`panel-drawer ${menuAbierto ? 'open' : ''}`}>
        <button className="panel-drawer-close" onClick={() => setMenuAbierto(false)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <div className="panel-drawer-user">
          <div className="panel-drawer-avatar">{inicial}</div>
          <div style={{ minWidth: 0 }}>
            <div className="panel-drawer-name">{correo}</div>
            <div className="panel-drawer-role">{etiquetaRol}</div>
          </div>
        </div>
        <button className="panel-drawer-logout" onClick={cerrarSesion}>
          <IconoSalir />
          Cerrar sesión
        </button>
      </div>

      {/* ── CONTENIDO: lo único que cambia entre secciones ── */}
      <main className="panel-main">{children}</main>

      {/* ── MENÚ INFERIOR (móvil) ── */}
      <nav className="panel-bottom-nav">
        <div className="panel-bottom-nav-inner">
          {items.map((it) => (
            <Link key={it.href} href={it.href} className={`panel-bottom-nav-item ${pathname === it.href ? 'active' : ''}`}>
              <span className="panel-bottom-nav-icon">{it.icono}</span>
              <span className="panel-bottom-nav-label">{it.corto}</span>
            </Link>
          ))}
        </div>
      </nav>

    </div>
  );
}
