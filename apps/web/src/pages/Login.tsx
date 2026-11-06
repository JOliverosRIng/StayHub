import React, { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { ApiError } from '../api/identity';
import { useAuth } from '../context/AuthContext';

interface LoginProps {
  onNavigate: (page: string) => void;
  onSuccess: () => void;
  initialEmail?: string;
  registered?: boolean;
}

function validate(email: string, password: string) {
  const errs: { email?: string; password?: string } = {};
  if (email.length > 254) errs.email = 'El correo admite hasta 254 caracteres';
  else if (!email) errs.email = 'El correo es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Ingresa un correo válido';
  if (password.length > 128) errs.password = 'La contraseña admite hasta 128 caracteres';
  else if (!password) errs.password = 'La contraseña es obligatoria';
  return errs;
}

export function Login({ onNavigate, onSuccess, initialEmail = '', registered = false }: LoginProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);

  const submitting = useRef(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const errs = validate(email.trim(), password);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    submitting.current = true; setLoading(true);
    try { await login(email.trim(), password); onSuccess(); }
    catch (error) { setErrors({ general: error instanceof ApiError ? error.message : 'No pudimos iniciar sesión.' }); }
    finally { submitting.current = false; setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src="https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=900&h=1200&fit=crop&auto=format"
          alt="Villa de lujo"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <button onClick={() => onNavigate('home')} className="absolute top-6 left-6 flex items-center gap-2">
          <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
            <path d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z" fill="#E31C5F" />
            <circle cx="16" cy="15" r="4" fill="white" />
          </svg>
          <span className="text-xl font-bold text-white">stayhub<span className="text-[#E31C5F]">.</span></span>
        </button>
        <div className="absolute bottom-10 left-8 right-8 text-white">
          <p className="text-lg font-semibold leading-snug mb-2">
            "StayHub transformó por completo nuestra forma de descubrir alojamientos."
          </p>
          <p className="text-sm text-white/70">— María G., viajera frecuente</p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex flex-col w-full lg:w-1/2">
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2 lg:hidden">
            <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
              <path d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z" fill="#E31C5F" />
              <circle cx="16" cy="15" r="4" fill="white" />
            </svg>
            <span className="text-xl font-bold text-gray-900">stayhub<span className="text-[#E31C5F]">.</span></span>
          </button>
          <div className="hidden lg:block" />
          <button onClick={() => onNavigate('home')} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            Explorar destinos →
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 py-10 max-w-md mx-auto w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Te damos la bienvenida a StayHub</h1>
          <p className="text-sm text-gray-500 mb-8">Accede a tu cuenta para continuar explorando.</p>

          {registered && <p role="status" className="mb-4 text-green-700">Cuenta creada. Inicia sesión para continuar.</p>}
          <form aria-busy={loading} className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {errors.general && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {errors.general}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">Correo electrónico</label>
              <input
                id="email" disabled={loading} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-error-email' : undefined}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="tu@email.com"
                className={`h-11 px-4 rounded-xl border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E31C5F] focus:border-transparent transition ${errors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
              />
              {errors.email && <p id="login-error-email" role="alert" className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">Contraseña</label>
              </div>
              <div className="relative">
                <input
                  id="password" disabled={loading} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-error-password' : undefined}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                  placeholder="••••••••"
                  className={`h-11 w-full px-4 pr-11 rounded-xl border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E31C5F] focus:border-transparent transition ${errors.password ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword
                    ? <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    : <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  }
                </button>
              </div>
              {errors.password && <p id="login-error-password" role="alert" className="text-xs text-red-500">{errors.password}</p>}
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} className="mt-2">
              Iniciar sesión →
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            ¿No tienes cuenta?{' '}
            <button onClick={() => onNavigate('register')} className="text-[#E31C5F] font-semibold hover:underline">
              Regístrate gratis
            </button>
          </p>
        </div>

        <div className="px-8 py-4 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 justify-center">
          {['Privacidad', 'Condiciones', 'Empresa', 'Soporte'].map((t) => (
            <button key={t} className="text-xs text-gray-400 hover:text-gray-600">{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
