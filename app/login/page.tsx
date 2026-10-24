'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // true = estado "sidebar". Arranca así si venimos de cerrar sesión (animación inversa)
  const [isExiting, setIsExiting] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('logout-anim') === '1'
  );
  const [message, setMessage] = useState<{ type: 'error'; text: string } | null>(null);

  // Si venimos del logout: esperamos a que se pinte el estado "sidebar" y luego
  // quitamos la clase para que el panel crezca y aparezca la foto poco a poco.
  useEffect(() => {
    if (sessionStorage.getItem('logout-anim') !== '1') return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setIsExiting(false);
        sessionStorage.removeItem('logout-anim');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  // Si la app cerró la sesión porque el administrador retiró el rol, se avisa aquí
  useEffect(() => {
    if (sessionStorage.getItem('acceso-retirado') !== '1') return;
    const raf = requestAnimationFrame(() => {
      sessionStorage.removeItem('acceso-retirado');
      setMessage({ type: 'error', text: 'Tu cuenta ya no tiene acceso. Comunícate con el administrador.' });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
    if (error) {
      const credencialesInvalidas = /invalid login credentials/i.test(error.message);
      const bloqueada = /banned/i.test(error.message);
      setMessage({
        type: 'error',
        text: credencialesInvalidas
          ? 'Correo o contraseña incorrectos.'
          : bloqueada
            ? 'Esta cuenta ya no tiene acceso. Comunícate con el administrador.'
            : error.message,
      });
      setLoading(false);
      return;
    }

    let destino = '/recepcion';
    const userId = data.user?.id;
    if (userId) {
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', userId).single();
      if (perfil?.rol === 'administrador') destino = '/asignacion';
    }

    router.prefetch(destino); // precarga la ruta para que el cambio sea instantáneo
    setLoading(false);
    setIsExiting(true);

    // Debe coincidir con la duración de la transición en globals.css (0.9s)
    setTimeout(() => {
      router.replace(destino);
    }, 900);
  }

  return (
    // Agregamos la clase dinámica 'exiting' cuando el usuario inicia sesión con éxito
    <div className={`auth-page ${isExiting ? 'exiting' : ''}`}>
      
      {/* Lado Izquierdo (La marca/imagen que se convertirá en el Sidebar) */}
      <div className="auth-brand">
        <div className="auth-brand-inner">
        <div className="auth-brand-title"><span>Themis</span></div>
        <div className="auth-brand-title">Consultorio <span>Jurídico</span> </div>
        <div className="auth-brand-sub">De la universidad de Córdoba</div>
        <div className="auth-brand-desc">Gestión integral de la recepción, asignación y seguimiento de asesorías.</div>
        <div className="auth-stats">
          <div>
            <div className="auth-stat-num">Recepción</div>
            <div className="auth-stat-label">De casos</div>
          </div>
          <div>
            <div className="auth-stat-num">Asignación</div>
            <div className="auth-stat-label">A estudiantes</div>
          </div>
          <div>
            <div className="auth-stat-num">Asesorías</div>
            <div className="auth-stat-label">Seguimiento</div>
          </div>
        </div>
        </div>
      </div>

      {/* Lado Derecho (El formulario que se desvanece hacia la derecha) */}
      <div className="auth-form-side">
        <div className="auth-card">
          <h2>Bienvenido</h2>
          <p className="subtitle">Ingrese sus credenciales para continuar</p>

          <form onSubmit={handleSubmit}>
            <div className="auth-input-row">
              <label htmlFor="correo" className="sr-only">Correo electrónico</label>
              <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="10" r="3.2" />
                <path d="M5.8 18.6c1.4-2.3 3.6-3.4 6.2-3.4s4.8 1.1 6.2 3.4" />
              </svg>
              <input
                id="correo"
                type="email"
                required
                autoComplete="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Correo electrónico"
              />
            </div>

            <div className="auth-input-row">
              <label htmlFor="password" className="sr-only">Contraseña</label>
              <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.9 10.9 0 0 1 12 20c-6.5 0-10-8-10-8a18.5 18.5 0 0 1 4.06-5.06" />
                    <path d="M9.9 4.24A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a18.6 18.6 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <path d="M2 2l20 20" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={loading || isExiting}>
                {loading ? 'Verificando...' : 'Iniciar sesión'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}