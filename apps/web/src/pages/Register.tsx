import React, { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { ApiError, type RegisterRequest } from '../api/identity';
import { useAuth } from '../context/AuthContext';

interface RegisterProps {
  onNavigate: (page: string) => void;
  onSuccess: (email: string) => void;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
  role?: string;
  general?: string;
}

function validate(name: string, email: string, password: string, confirm: string, role: string): FormErrors {
  const errs: FormErrors = {};
  if (name.trim().length < 2 || name.trim().length > 100) errs.name = 'El nombre debe tener entre 2 y 100 caracteres';
  if (!['GUEST', 'OWNER'].includes(role)) errs.role = 'Selecciona huésped o propietario';
  if (email.length > 254) errs.email = 'El correo admite hasta 254 caracteres';
  else if (!email) errs.email = 'El correo es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Ingresa un correo válido';
  if (!password) errs.password = 'La contraseña es obligatoria';
  else if (password.length > 128) errs.password = 'La contraseña admite hasta 128 caracteres';
  else if (password.length < 8) errs.password = 'La contraseña debe tener mínimo 8 caracteres';
  if (!confirm) errs.confirm = 'Confirma tu contraseña';
  else if (confirm !== password) errs.confirm = 'Las contraseñas no coinciden';
  return errs;
}

export function Register({ onNavigate, onSuccess }: RegisterProps) {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: '' });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    attempt.current = undefined;
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((p) => ({ ...p, [k]: undefined, general: undefined }));
  };

  const submitting = useRef(false);
  const attempt = useRef<string>();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const errs = validate(form.name, form.email.trim(), form.password, form.confirm, form.role);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    submitting.current = true; setLoading(true);
    attempt.current ??= crypto.randomUUID();
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role as RegisterRequest['role'] }, attempt.current);
      onSuccess(form.email.trim());
    } catch (error) {
      setErrors({ general: error instanceof ApiError ? error.message : 'No pudimos crear la cuenta.' });
    } finally { submitting.current = false; setLoading(false); }
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

          <form aria-busy={loading} className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {errors.general && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {errors.general}
              </div>
            )}

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-name" className="text-sm font-medium text-gray-700">Nombre completo</label>
              <input type="text" id="register-name" disabled={loading} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'error-name' : undefined} value={form.name} onChange={set('name')} placeholder="Carlos Martínez" className={field('name')} />
              {errors.name && <p id="error-name" role="alert" className="text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-email" className="text-sm font-medium text-gray-700">Correo electrónico</label>
              <input type="email" id="register-email" disabled={loading} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'error-email' : undefined} value={form.email} onChange={set('email')} placeholder="carlos@email.com" className={field('email')} />
              {errors.email && <p id="error-email" role="alert" className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-role" className="text-sm font-medium text-gray-700">Tipo de cuenta</label>
              <select id="register-role" value={form.role} onChange={set('role')} disabled={loading} aria-invalid={!!errors.role} aria-describedby={errors.role ? 'error-role' : undefined} className={field('role')}>
                <option value="">Selecciona una opción</option><option value="GUEST">Huésped</option><option value="OWNER">Propietario</option>
              </select>
              {errors.role && <p id="error-role" role="alert" className="text-xs text-red-500">{errors.role}</p>}
            </div>
            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-password" className="text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  id="register-password" disabled={loading} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'error-password' : undefined} value={form.password}
                  onChange={set('password')}
                  placeholder="Mínimo 8 caracteres"
                  className={field('password') + ' pr-11'}
                />
                <button type="button" aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass
                    ? <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    : <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  }
                </button>
              </div>
              {errors.password && <p id="error-password" role="alert" className="text-xs text-red-500">{errors.password}</p>}
            </div>

            {/* Confirm */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-confirm" className="text-sm font-medium text-gray-700">Confirmar contraseña</label>
              <input
                type={showPass ? 'text' : 'password'}
                id="register-confirm" disabled={loading} aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? 'error-confirm' : undefined} value={form.confirm}
                onChange={set('confirm')}
                placeholder="Repite tu contraseña"
                className={field('confirm')}
              />
              {errors.confirm && <p id="error-confirm" role="alert" className="text-xs text-red-500">{errors.confirm}</p>}
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} className="mt-2">
              Crear cuenta en StayHub →
            </Button>
          </form>

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
