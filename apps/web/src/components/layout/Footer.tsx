import { LogoIcon } from './Logo';

const COLUMNS = [
  { title: 'Asistencia', links: ['Centro de ayuda', 'Información de seguridad', 'Opciones de cancelación', 'Soporte para personas con discapacidad'] },
  { title: 'Comunidad', links: ['StayHub.org', 'Programa de referidos', 'Viajeros accesibles', 'Asociados locales'] },
  { title: 'Alojamiento y hoteles', links: ['Publicar tu alojamiento', 'Recursos para anfitriones', 'Foro de anfitriones', 'Panel de gestión'] },
  { title: 'Acerca de StayHub', links: ['Sala de prensa', 'Inversores', 'Blog de viajes', 'Trabaja con nosotros'] },
];

const LEGAL_LINKS = ['Privacidad', 'Condiciones', 'Mapa del sitio', 'Empresa'];

function Locale() {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-500">
      <span>🌐 Español (ES)</span>
      <span>€ EUR</span>
    </div>
  );
}

/** 'full' = columnas de enlaces (Home). 'simple' = solo una línea legal (páginas internas). */
export function Footer({ variant = 'full' }: { variant?: 'full' | 'simple' }) {
  if (variant === 'simple') {
    return (
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-screen-xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">© 2026 StayHub, Inc. · {LEGAL_LINKS.slice(0, 3).join(' · ')}</p>
          <Locale />
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-screen-xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{col.title}</h3>
            <ul className="flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link}>
                  <button className="text-sm text-gray-500 hover:text-gray-900 transition-colors text-left">{link}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <LogoIcon className="w-5 h-5" />
            <span>© 2026 StayHub, Inc.</span>
          </div>
          <div className="flex gap-4">
            {LEGAL_LINKS.map((t) => (
              <button key={t} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">{t}</button>
            ))}
          </div>
          <Locale />
        </div>
      </div>
    </footer>
  );
}
