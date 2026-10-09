'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // ajusta esta ruta si tu cliente está en otro lugar

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
    if (error) {
      // Un monitor al que se le quitó el rol tiene la cuenta bloqueada: se explica en español.
      const bloqueada = /banned/i.test(error.message);
      setMessage({
        type: 'error',
        text: bloqueada ? 'Esta cuenta ya no tiene acceso. Comunícate con el administrador.' : error.message,
      });
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
      <div className="auth-deco-1" />
      <div className="auth-deco-2" />

      <div className="auth-brand">
        <div className="auth-badge">
          <div className="auth-badge-dot" />
          <span>Sistema Activo</span>
        </div>
        <div className="auth-brand-title">
          Consultorio <span>Jurídico</span>
        </div>
        <div className="auth-brand-sub">Unicórdoba</div>
        <div className="auth-brand-desc">
          Gestión integral de la recepción, asignación y seguimiento de asesorías.
        </div>
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

            <div className="auth-divider" />

            {message && <div className={`form-message ${message.type}`}>{message.text}</div>}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Iniciar sesión →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}