'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
        <div className="auth-brand-title"><span>Athemis</span></div>
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
            <div className="field">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="sebastianube19@gmail.com"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="auth-divider" />

            {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

            <button className="btn-primary" type="submit" disabled={loading || isExiting}>
              {loading ? 'Verificando...' : 'Iniciar sesión →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}