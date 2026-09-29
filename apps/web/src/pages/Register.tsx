import { useState } from 'react';
import { Button } from '../components/ui/Button';
import type { Navigate } from '../types';
import { Logo } from '../components/layout/Logo';

interface RegisterProps {
  onNavigate: Navigate;
}

export function Register({ onNavigate }: RegisterProps) {
  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    correo: '',
    password: '',
    fechaNacimiento: '',
    huespedes: '1',
    aceptaTerminos: false,
  });

  const set = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen flex">
      {/* Left panel – form */}
      <div className="flex flex-col w-full lg:w-1/2">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <Logo size="lg" onClick={() => onNavigate('home')} />
          <span className="text-sm text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <button onClick={() => onNavigate('login')} className="text-primary font-semibold hover:underline">
              Inicia sesión
            </button>
          </span>
        </div>

        {/* Form */}
        <div className="flex-1 flex flex-col justify-center px-8 py-10 max-w-md mx-auto w-full overflow-y-auto">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
            Registro de nueva cuenta
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Crea tu cuenta en StayHub</h1>
          <p className="text-sm text-gray-500 mb-7">
            Todo destino que sueñas comienza con una sola búsqueda.
          </p>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onNavigate('home');
            }}
          >
            {/* Nombre + Apellidos */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => set('nombre', e.target.value)}
                  placeholder="Carlos"
                  className="h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Apellidos</label>
                <input
                  type="text"
                  value={form.apellidos}
                  onChange={(e) => set('apellidos', e.target.value)}
                  placeholder="Martínez"
                  className="h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Correo electrónico</label>
              <input
                type="email"
                value={form.correo}
                onChange={(e) => set('correo', e.target.value)}
                placeholder="carlos@email.com"
                className="h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Contraseña</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              />
            </div>

            {/* Fecha + Huéspedes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Fecha de nacimiento</label>
                <input
                  type="date"
                  value={form.fechaNacimiento}
                  onChange={(e) => set('fechaNacimiento', e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Núm. de huéspedes</label>
                <select
                  value={form.huespedes}
                  onChange={(e) => set('huespedes', e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'huésped' : 'huéspedes'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Términos */}
            <label className="flex items-start gap-3 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={form.aceptaTerminos}
                onChange={(e) => set('aceptaTerminos', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm text-gray-600">
                Acepto los{' '}
                <button type="button" className="text-primary font-medium hover:underline">Términos de servicio</button>
                {' '}y la{' '}
                <button type="button" className="text-primary font-medium hover:underline">Política de privacidad</button>
              </span>
            </label>

            <Button type="submit" variant="primary" size="lg" fullWidth className="mt-2">
              Crear cuenta en StayHub →
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">O regístrate con</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex gap-3">
            <Button variant="social" size="md" fullWidth>
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </Button>
            <Button variant="social" size="md" fullWidth>
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-gray-900">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Apple
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 justify-center">
          {['Privacidad', 'Condiciones', 'Mapa del sitio', 'Empresa', 'Soporte'].map((item) => (
            <button key={item} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Right panel – image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&h=1200&fit=crop&auto=format"
          alt="Hotel de lujo con piscina"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute bottom-10 left-8 right-8 text-white">
          <h2 className="text-2xl font-bold leading-snug mb-2">
            Tu próximo destino comienza con una sola llave.
          </h2>
          <p className="text-sm text-white/70">
            Miles de alojamientos únicos te esperan en todo el mundo.
          </p>
        </div>
      </div>
    </div>
  );
}
