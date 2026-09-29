import { Button } from '../ui/Button';
import { LogoIcon } from '../layout/Logo';

export function MapCta() {
  return (
    <section className="mb-12">
          <div className="flex flex-col lg:flex-row items-center gap-8 bg-gray-50 rounded-3xl p-8">
            <div className="lg:w-1/2">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                ¿Prefieres elegir tu hotel por barrio o cercanía a atractivos?
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Explora el mapa interactivo y encuentra el alojamiento perfecto en la zona que más te convenga.
              </p>
              <Button variant="primary" size="md">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 1 1-14.14 14.14A10 10 0 0 1 19.07 4.93z" />
                </svg>
                Ver Mapa Interactivo
              </Button>
            </div>
            <div className="lg:w-1/2 w-full h-52 rounded-2xl overflow-hidden bg-gray-200 relative">
              <img
                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=700&h=400&fit=crop&auto=format"
                alt="Mapa interactivo"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                  <LogoIcon className="w-5 h-5" />
                  <span className="text-xs font-semibold text-gray-800">24 propiedades aquí</span>
                </div>
              </div>
            </div>
          </div>
        </section>
  );
}
