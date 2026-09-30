import React, { useState } from 'react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';

interface RegisterProps {
  onNavigate: (page: string) => void;
  onSuccess: () => void;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  general?: string;
}

function validate(name: string, email: string, password: string, confirm: string): FormErrors {
  const errs: FormErrors = {};
  if (!name.trim()) errs.name = 'El nombre es obligatorio';
  if (!email) errs.email = 'El correo es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Ingresa un correo válido';
  if (!password) errs.password = 'La contraseña es obligatoria';
  else if (password.length < 8) errs.password = 'La contraseña debe tener mínimo 8 caracteres';
  if (!confirm) errs.confirm = 'Confirma tu contraseña';
  else if (confirm !== password) errs.confirm = 'Las contraseñas no coinciden';
  return errs;
}

export function Register({ onNavigate, onSuccess }: RegisterProps) {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((p) => ({ ...p, [k]: undefined, general: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form.name, form.email, form.password, form.confirm);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    const result = register(form.name, form.email, form.password);
    setLoading(false);
    if (!result.success) {
      setErrors({ general: result.error });
    } else {
      onSuccess();
    }
  };

  const field = (id: keyof typeof form) =>
    `h-11 w-full px-4 rounded-xl border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E31C5F] focus:border-transparent transition ${errors[id] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

  return (
    <div className="min-h-screen flex">
      {/* Left — form */}
      <div className="flex flex-col w-full lg:w-1/2">
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
              <path d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z" fill="#E31C5F" />
              <circle cx="16" cy="15" r="4" fill="white" />
            </svg>
            <span className="text-xl font-bold text-gray-900">stayhub<span className="text-[#E31C5F]">.</span></span>
          </button>
          <span className="text-sm text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <button onClick={() => onNavigate('login')} className="text-[#E31C5F] font-semibold hover:underline">
              Inicia sesión
            </button>
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 py-10 max-w-md mx-auto w-full overflow-y-auto">
          <p className="text-xs font-semibold text-[#E31C5F] uppercase tracking-wider mb-2">Registro de nueva cuenta</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Crea tu cuenta en StayHub</h1>
          <p className="text-sm text-gray-500 mb-7">Todo destino que sueñas comienza con una sola búsqueda.</p>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {errors.general && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {errors.general}
              </div>
            )}

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Nombre completo</label>
              <input type="text" value={form.name} onChange={set('name')} placeholder="Carlos Martínez" className={field('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Correo electrónico</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="carlos@email.com" className={field('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Mínimo 8 caracteres"
                  className={field('password') + ' pr-11'}
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass
                    ? <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    : <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  }
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            {/* Confirm */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Confirmar contraseña</label>
              <input
                type={showPass ? 'text' : 'password'}
                value={form.confirm}
                onChange={set('confirm')}
                placeholder="Repite tu contraseña"
                className={field('confirm')}
              />
              {errors.confirm && <p className="text-xs text-red-500">{errors.confirm}</p>}
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} className="mt-2">
              Crear cuenta en StayHub →
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">O regístrate con</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex gap-3">
            <Button variant="social" size="md" fullWidth>
              <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
              Google
            </Button>
            <Button variant="social" size="md" fullWidth>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gray-900"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
              Apple
            </Button>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Al registrarte aceptas nuestros{' '}
            <button type="button" className="text-[#E31C5F] font-medium hover:underline">Términos</button>
            {' '}y{' '}
            <button type="button" className="text-[#E31C5F] font-medium hover:underline">Política de privacidad</button>
          </p>
        </div>

        <div className="px-8 py-4 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 justify-center">
          {['Privacidad', 'Condiciones', 'Empresa', 'Soporte'].map((t) => (
            <button key={t} className="text-xs text-gray-400 hover:text-gray-600">{t}</button>
          ))}
        </div>
      </div>

      {/* Right — image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&h=1200&fit=crop&auto=format"
          alt="Hotel de lujo con piscina"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute bottom-10 left-8 right-8 text-white">
          <h2 className="text-2xl font-bold leading-snug mb-2">Tu próximo destino comienza con una sola llave.</h2>
          <p className="text-sm text-white/70">Miles de alojamientos únicos te esperan en todo el mundo.</p>
        </div>
      </div>
    </div>
  );
}
