'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase'; // ajusta esta ruta si tu cliente está en otro lugar

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: correo, password })
        : await supabase.auth.signUp({ email: correo, password });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else if (mode === 'signup') {
      setMessage({ type: 'success', text: 'Cuenta creada. Revisa tu correo para confirmarla.' });
    } else {
      window.location.href = '/recepcion'; // redirige tras iniciar sesión
    }

    setLoading(false);
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