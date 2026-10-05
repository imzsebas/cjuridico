'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta esta ruta si tu cliente está en otro lugar

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email: correo, password });
      if (error) setMessage({ type: 'error', text: error.message });
      else setMessage({ type: 'success', text: 'Cuenta creada. Revisa tu correo para confirmarla.' });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
      return;
    }

    // Cada rol entra a su pantalla de inicio. Si no se puede leer el rol, se va a /recepcion
    // (lo que hacía antes), y cada página vuelve a validar el permiso por su cuenta.
    let destino = '/recepcion';
    const userId = data.user?.id;
    if (userId) {
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', userId).single();
      if (perfil?.rol === 'administrador') destino = '/asignacion';
    }
    router.replace(destino);
    // No se apaga "loading": el botón queda bloqueado mientras se carga la nueva pantalla.
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-emblem">CJ</div>
        <h1>Consultorio Jurídico</h1>
        <div className="auth-brand-divider" />
        <p className="auth-brand-sub">Unicórdoba</p>
        <p className="auth-brand-tagline">Accede a tu cuenta para continuar</p>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
          <p className="subtitle">
            {mode === 'login' ? 'Ingresa tus datos para continuar' : 'Regístrate con tu correo'}
          </p>

          {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tucorreo@unicordoba.edu.co"
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

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>

          <div className="switch-mode">
            {mode === 'login' ? (
              <>¿No tienes cuenta? <button onClick={() => setMode('signup')}>Regístrate</button></>
            ) : (
              <>¿Ya tienes cuenta? <button onClick={() => setMode('login')}>Inicia sesión</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}