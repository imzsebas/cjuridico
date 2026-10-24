'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ProveedorSesion, type Sesion } from '@/lib/sesion';
import ModalReparto from '@/components/ModalReparto';

const ICONOS = {
  recepcion: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M6 6h6M6 9h6M6 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  asignacion: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M1 16c0-3.314 2.686-6 6-6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M11.5 13.5l1.5 1.5 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  reparto: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><rect x="2" y="2.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="10.5" y="2.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="2" y="10" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 12.75h5.5M13.25 10v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  libro: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><path d="M3 3.5A1.5 1.5 0 014.5 2H15v12H4.5A1.5 1.5 0 003 15.5v-12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M3 15.5A1.5 1.5 0 004.5 17H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  estudiantes: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M3 16c0-2.761 2.686-5 6-5s6 2.239 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  monitores: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M1 16c0-3.314 2.686-6 6-6h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><rect x="10.5" y="10.5" width="6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><path d="M12 10.5V9.5a1.5 1.5 0 013 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  calendario: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><rect x="2.5" y="3.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 7.5h13M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M6 11h1.5M10.5 11H12M6 13.5h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  historial: (
    <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="M9 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
};

type Enlace = {
  href?: string; // si no tiene href, es un botón que ejecuta una acción
  label: string;
  corto: string;
  grupo: string;
  icono: ReactNode;
  roles: string[];
};

const ENLACES: Enlace[] = [
  { href: '/recepcion', label: 'Recepción', corto: 'Recepción', grupo: 'Gestión', icono: ICONOS.recepcion, roles: ['administrador', 'monitor'] },
  { href: '/calendario', label: 'Calendario', corto: 'Horarios', grupo: 'Gestión', icono: ICONOS.calendario, roles: ['administrador'] },
  { href: '/asignacion', label: 'Asignar', corto: 'Asignar', grupo: 'Asignaciones', icono: ICONOS.asignacion, roles: ['administrador'] },
  { label: 'Generar reparto', corto: 'Reparto', grupo: 'Asignaciones', icono: ICONOS.reparto, roles: ['administrador'] },
  { href: '/libro-asesorias', label: 'Libro de asesorías', corto: 'Libro', grupo: 'Registros', icono: ICONOS.libro, roles: ['administrador'] },
  { href: '/estudiantes', label: 'Estudiantes', corto: 'Estudiantes', grupo: 'Registros', icono: ICONOS.estudiantes, roles: ['administrador'] },
  { href: '/monitores', label: 'Monitores', corto: 'Monitores', grupo: 'Registros', icono: ICONOS.monitores, roles: ['administrador'] },
  { href: '/mis-recepciones', label: 'Mis recepciones', corto: 'Historial', grupo: 'Registros', icono: ICONOS.historial, roles: ['monitor'] },
];

const ETIQUETA_ROL: Record<string, string> = { administrador: 'Administrador', monitor: 'Monitor' };

const IconoSalir = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Barra oscura que se desliza de un ítem del menú al otro.
// Va como primer hijo de <nav className="panel-nav">; detecta sola el ítem ".active",
// incluso si los ítems se dibujan después (cuando carga el rol del usuario).
function IndicadorMenu() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ind = ref.current;
    const nav = ind?.parentElement;
    if (!ind || !nav) return;

    const CLAVE = 'nav-indicador-pos';
    let iniciado = false;
    let ultimo = { y: -1, h: -1 };

    const poner = (y: number, h: number) => {
      ind.style.setProperty('--y', `${y}px`);
      ind.style.setProperty('--h', `${h}px`);
    };

    const mover = () => {
      const activo = nav.querySelector<HTMLElement>('.panel-nav-item.active');
      if (!activo) {
        // solo toca la clase si hace falta, para no disparar el observer en bucle
        if (ind.classList.contains('listo')) ind.classList.remove('listo');
        return;
      }
      const y = activo.offsetTop;
      const h = activo.offsetHeight;

      if (!iniciado) {
        iniciado = true;
        // Si venimos de otra página, arranca donde estaba la barra y se desliza desde ahí
        let desde = { y, h };
        try {
          const g = sessionStorage.getItem(CLAVE);
          if (g) desde = JSON.parse(g);
        } catch {}
        poner(desde.y, desde.h);
        ind.classList.add('listo');
        void ind.offsetHeight; // fija la posición inicial antes de activar la transición
        ind.classList.add('animar');
      }

      if (y !== ultimo.y || h !== ultimo.h) {
        ultimo = { y, h };
        poner(y, h);
        try {
          sessionStorage.setItem(CLAVE, JSON.stringify({ y, h }));
        } catch {}
      }
      if (!ind.classList.contains('listo')) ind.classList.add('listo');
    };

    mover();
    const obs = new MutationObserver((records) => {
      // ignora los cambios que hace el propio indicador
      if (records.every((r) => r.target === ind)) return;
      mover();
    });
    obs.observe(nav, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    window.addEventListener('resize', mover);

    return () => {
      obs.disconnect();
      window.removeEventListener('resize', mover);
    };
  }, []);

  return <div ref={ref} className="nav-indicator" aria-hidden="true" />;
}

// Ítem del menú: enlace a una sección, o botón que abre una acción (Generar reparto)
function ItemMenu({ it, clase, activo, onAccion, children }: {
  it: Enlace; clase: string; activo: boolean; onAccion: () => void; children: ReactNode;
}) {
  return it.href ? (
    <Link href={it.href} className={`${clase} ${activo ? 'active' : ''}`}>{children}</Link>
  ) : (
    <button type="button" className={clase} onClick={onAccion}>{children}</button>
  );
}

// Avatar + correo + rol (en el sidebar usa las clases "panel-user-*" y en el drawer móvil "panel-drawer-*")
function Usuario({ prefijo, inicial, correo, rol }: { prefijo: string; inicial: string; correo: string; rol: string }) {
  return (
    <>
      <div className={`${prefijo}-avatar`}>{inicial}</div>
      <div style={{ minWidth: 0 }}>
        <div className={`${prefijo}-name`}>{correo}</div>
        <div className={`${prefijo}-role`}>{rol}</div>
      </div>
    </>
  );
}

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = cargando · null = sin sesión (cada página redirige a /login)
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [repartoAbierto, setRepartoAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false); // animación de cierre de sesión

  // El rol se vuelve a revisar cada minuto, al volver a la pestaña y al cambiar de pantalla.
  // Si el administrador le quitó el rol a esta cuenta, se cierra la sesión de inmediato.
  const saliendoRef = useRef(false);
  const verificar = useCallback(async () => {
    if (saliendoRef.current) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setSesion(null); return; }
    const { data: perfil, error } = await supabase.from('usuarios').select('rol').eq('id', user.id).maybeSingle();
    if (error || saliendoRef.current) return; // sin conexión: se conserva lo que había
    const rol = perfil?.rol ?? null;
    if (rol !== 'administrador' && rol !== 'monitor') {
      saliendoRef.current = true;
      sessionStorage.setItem('acceso-retirado', '1'); // el login muestra el aviso
      await supabase.auth.signOut();
      router.replace('/login');
      return;
    }
    setSesion((antes) =>
      antes && antes.userId === user.id && antes.rol === rol && antes.correo === (user.email ?? '')
        ? antes
        : { userId: user.id, correo: user.email ?? '', rol }
    );
  }, [router]);

  useEffect(() => {
    const primera = setTimeout(verificar, 0); // se programa: el estado cambia cuando responde la base, no dentro del efecto
    const cadaMinuto = setInterval(verificar, 60_000);
    const alVolver = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    // La sesión también puede terminar sola (vencida o bloqueada): se manda al login
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT' && !saliendoRef.current) setSesion(null);
    });
    return () => {
      clearTimeout(primera);
      clearInterval(cadaMinuto);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      subscription.unsubscribe();
    };
  }, [verificar]);

  // Al cambiar de pantalla
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    const t = setTimeout(verificar, 0);
    return () => clearTimeout(t);
  }, [pathname, verificar]);

  async function cerrarSesion() {
    if (saliendo) return;
    saliendoRef.current = true;
    setMenuAbierto(false);
    setRepartoAbierto(false);
    setSaliendo(true);
    sessionStorage.setItem('logout-anim', '1'); // le avisa al login que venimos de cerrar sesión
    router.prefetch('/login');

    // El contenido se desvanece (0.3s) mientras se cierra la sesión;
    // /login arranca en este mismo estado y crece desde ahí.
    await Promise.all([
      supabase.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);
    router.push('/login');
  }

  const rol = sesion?.rol ?? null;
  const correo = sesion?.correo ?? '';
  const items = ENLACES.filter((e) => rol !== null && e.roles.includes(rol));
  const grupos = Array.from(new Set(items.map((i) => i.grupo)));
  const activo = ENLACES.find((e) => e.href === pathname);
  const inicial = (correo.charAt(0) || '?').toUpperCase();
  const abrirReparto = () => setRepartoAbierto(true);
  const etiquetaRol = rol ? (ETIQUETA_ROL[rol] ?? rol) : '';

  return (
    <div className={`panel-shell ${saliendo ? 'saliendo' : ''}`}>

      {/* ── SIDEBAR (escritorio) ── */}
      <aside className="panel-sidebar">
        <div className="panel-sidebar-deco" />
        <div className="panel-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-themis.png" alt="THEMIS" className="panel-logo-img" />
        </div>

        <nav className="panel-nav">
          <IndicadorMenu />
          {grupos.map((grupo, i) => (
            <div key={grupo}>
              <span className="panel-nav-label" style={i > 0 ? { marginTop: '1rem' } : undefined}>{grupo}</span>
              {items.filter((it) => it.grupo === grupo).map((it) => (
                <ItemMenu key={it.label} it={it} clase="panel-nav-item" activo={pathname === it.href} onAccion={abrirReparto}>
                  {it.icono}
                  <span className="panel-nav-text">{it.label}</span>
                </ItemMenu>
              ))}
            </div>
          ))}
        </nav>

        <div className="panel-sidebar-footer">
          <div className="panel-user-row">
            <Usuario prefijo="panel-user" inicial={inicial} correo={correo} rol={etiquetaRol} />
            <button className="panel-logout-btn" onClick={cerrarSesion} title="Cerrar sesión">
              <IconoSalir />
            </button>
          </div>
        </div>
      </aside>

      {/* ── BARRA SUPERIOR (móvil) ── */}
      <div className="panel-mobile-topbar">
        <div className="panel-mobile-topbar-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-themis.png" alt="THEMIS" className="panel-mobile-logo" />
          <div className="panel-mobile-topbar-section">{activo?.label}</div>
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
          <Usuario prefijo="panel-drawer" inicial={inicial} correo={correo} rol={etiquetaRol} />
        </div>
        <button className="panel-drawer-logout" onClick={cerrarSesion}>
          <IconoSalir />
          Cerrar sesión
        </button>
      </div>

      {/* ── CONTENIDO: lo único que cambia entre secciones ── */}
      <main className="panel-main">
        <ProveedorSesion value={sesion}>{children}</ProveedorSesion>
      </main>

      {/* ── MENÚ INFERIOR (móvil) ── */}
      <nav className="panel-bottom-nav">
        <div className="panel-bottom-nav-inner">
          {items.map((it) => (
            <ItemMenu key={it.label} it={it} clase="panel-bottom-nav-item" activo={pathname === it.href} onAccion={abrirReparto}>
              <span className="panel-bottom-nav-icon">{it.icono}</span>
              <span className="panel-bottom-nav-label">{it.corto}</span>
            </ItemMenu>
          ))}
        </div>
      </nav>

      {repartoAbierto && <ModalReparto onCerrar={() => setRepartoAbierto(false)} />}
    </div>
  );
}