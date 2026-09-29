import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { FEATURED, RECOMMENDED } from '../data/properties';
import type { Navigate } from '../types';
import { LogoIcon } from '../components/layout/Logo';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

interface PropertyDetailProps {
  onNavigate: Navigate;
  /** Id de la propiedad elegida en Home. */
  propertyId?: string;
}

const GALLERY = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=500&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400&h=250&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400&h=250&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&h=250&fit=crop&auto=format',
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400&h=250&fit=crop&auto=format',
];

const AMENITIES = [
  { icon: '🏊', label: 'Piscina privada' },
  { icon: '🛁', label: 'Bañera de hidromasaje' },
  { icon: '🍳', label: 'Cocina equipada' },
  { icon: '📶', label: 'Wifi de alta velocidad' },
  { icon: '🅿️', label: 'Estacionamiento gratuito' },
  { icon: '❄️', label: 'Aire acondicionado' },
  { icon: '🐾', label: 'Pet-friendly' },
  { icon: '🌿', label: 'Jardín privado' },
];

const REVIEWS = [
  {
    name: 'Sofía Navarro',
    date: 'Agosto 2026',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format',
    rating: 5,
    text: 'Un lugar absolutamente mágico. El servicio de conserjería fue excepcional, y las vistas desde la suite son simplemente impresionantes. Definitivamente regresaré.',
  },
  {
    name: 'Julián Vidmar',
    date: 'Julio 2026',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format',
    rating: 5,
    text: 'La villa superó todas mis expectativas. El acceso a la playa privada y la piscina infinity hacen de esta experiencia algo único. Muy recomendado para escapadas románticas.',
  },
];

const CALENDAR_DAYS = Array.from({ length: 35 }, (_, i) => {
  const day = i - 4;
  return day > 0 && day <= 31 ? day : null;
});

const SELECTED_START = 8;
const SELECTED_END = 12;

export function PropertyDetail({ onNavigate, propertyId }: PropertyDetailProps) {
  const [selectedNights] = useState(4);
  const [saved, setSaved] = useState(false);
  // Busca la propiedad elegida; si no existe usa la primera como respaldo
  const property = [...RECOMMENDED, ...FEATURED].find((p) => p.id === propertyId) ?? RECOMMENDED[0];
  const { title, rating, reviewCount, pricePerNight } = property;
  const cleaningFee = 95;
  const serviceFee = 92;
  const total = pricePerNight * selectedNights + cleaningFee + serviceFee;

  return (
    <div className="min-h-screen bg-white">
      <Header onNavigate={onNavigate} navItems={['Alojamientos', 'Experiencias', 'Destinos turísticos']} />

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <button onClick={() => onNavigate('home')} className="hover:underline">Inicio</button>
          <span>/</span>
          <button className="hover:underline">Mallorca</button>
          <span>/</span>
          <span className="text-gray-900 font-medium">{title}</span>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <div className="flex items-center gap-1">
                <svg viewBox="0 0 20 20" className="w-4 h-4 fill-primary">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-sm font-semibold text-gray-900">{rating.toFixed(2)}</span>
                <span className="text-sm text-gray-500">({reviewCount} reseñas)</span>
              </div>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-700 underline cursor-pointer">Palma de Mallorca, España</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Compartir
            </button>
            <button
              onClick={() => setSaved((s) => !s)}
              className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
            >
              <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-colors ${saved ? 'fill-primary stroke-primary' : 'fill-none stroke-gray-700'}`} strokeWidth={2}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {saved ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* ── Gallery ── */}
        <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-2xl overflow-hidden h-72 md:h-96 mb-10">
          <div className="col-span-2 row-span-2">
            <img src={property.image} alt="Vista principal" className="w-full h-full object-cover" />
          </div>
          {GALLERY.slice(1).map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt={`Vista ${i + 2}`} className="w-full h-full object-cover" />
              {i === 3 && (
                <button className="absolute bottom-2 right-2 bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-md hover:bg-gray-100 transition-colors">
                  + 18 fotos
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ── Content grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
          {/* Left column */}
          <div>
            {/* Host */}
            <div className="flex items-center justify-between pb-6 border-b border-gray-200 mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Suite Deluxe administrada por Elena & Mateo</h2>
                <p className="text-sm text-gray-500 mt-0.5">4 huéspedes · 2 habitaciones · 2 camas · 2 baños</p>
              </div>
              <div className="flex -space-x-3">
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format" alt="Elena" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format" alt="Mateo" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
              </div>
            </div>

            {/* Highlights */}
            <div className="flex flex-col gap-4 pb-6 border-b border-gray-200 mb-6">
              {[
                { icon: '🔑', title: 'Llegada autónoma 24/7 y servicio de conserjería', desc: 'Accede a tu habitación a cualquier hora con llave digital.' },
                { icon: '✅', title: 'Cancelación flexible garantizada', desc: 'Cancela sin costo hasta 48 horas antes de la llegada.' },
                { icon: '🏅', title: 'Equipo de trabajo dedicado y Mesa para la estética', desc: 'Espacio ideal para trabajar o relajarte durante tu estancia.' },
              ].map((h) => (
                <div key={h.title} className="flex items-start gap-4">
                  <span className="text-2xl">{h.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{h.title}</p>
                    <p className="text-sm text-gray-500">{h.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Description */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Sobre este refugio en Mallorca</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                Descubre la elegancia atemporal de Villa Serena Boutique Hotel & Spa, un refuge exclusivo en el corazón de Palma de Mallorca. Nuestra Suite Deluxe te ofrece una experiencia hotelera de categoría 5 estrellas con el trato personalizado de un alojamiento boutique.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed mt-3">
                Disfruta de la piscina infinity con vistas al Mar Mediterráneo, el spa completo con tratamientos exclusivos, y los desayunos mediterráneos preparados por nuestro chef. A solo 5 minutos del centro histórico y a 10 minutos de las mejores playas de la isla.
              </p>
              <button className="text-sm font-semibold text-gray-900 underline mt-3 hover:text-primary transition-colors">
                Mostrar más →
              </button>
            </div>

            {/* Where to sleep */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Dónde vas a descansar</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'Dormitorio Principal', desc: '1 cama King Size' },
                  { name: 'Termas & Solarium Privado', desc: 'Instalaciones exclusivas' },
                ].map((room) => (
                  <div key={room.name} className="border border-gray-200 rounded-2xl p-4 hover:border-gray-400 transition-colors">
                    <span className="text-2xl mb-2 block">🛏️</span>
                    <p className="text-sm font-semibold text-gray-900">{room.name}</p>
                    <p className="text-sm text-gray-500">{room.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Amenities */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Lo que ofrece este lugar</h3>
              <div className="grid grid-cols-2 gap-3">
                {AMENITIES.map((a) => (
                  <div key={a.label} className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="text-xl">{a.icon}</span>
                    {a.label}
                  </div>
                ))}
              </div>
              <button className="mt-5 text-sm font-semibold border border-gray-900 text-gray-900 px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Mostrar las 22 comodidades
              </button>
            </div>

            {/* Calendar */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">4 noches en Palma de Mallorca</h3>
              <p className="text-sm text-gray-500 mb-4">
                <span className="font-medium">8 mayo 2025</span> — <span className="font-medium">12 mayo 2025</span>
              </p>

              <div className="border border-gray-200 rounded-2xl p-5 inline-block w-full max-w-sm">
                <div className="flex items-center justify-between mb-4">
                  <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <span className="text-sm font-semibold text-gray-900">Mayo 2025</span>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d) => (
                    <span key={d} className="text-xs font-medium text-gray-400">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {CALENDAR_DAYS.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const isSelected = day >= SELECTED_START && day <= SELECTED_END;
                    const isStart = day === SELECTED_START;
                    const isEnd = day === SELECTED_END;
                    return (
                      <div
                        key={i}
                        className={`h-8 w-8 mx-auto flex items-center justify-center text-sm transition-colors rounded-full cursor-pointer
                          ${isStart || isEnd ? 'bg-primary text-white font-semibold' : ''}
                          ${isSelected && !isStart && !isEnd ? 'bg-primary-light text-primary' : ''}
                          ${!isSelected ? 'text-gray-700 hover:bg-gray-100' : ''}
                        `}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="pb-6 border-b border-gray-200 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Ubicación estratégica</h3>
              <div className="rounded-2xl overflow-hidden h-52 bg-gray-100 relative">
                <img
                  src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=700&h=300&fit=crop&auto=format"
                  alt="Mapa de ubicación"
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                    <LogoIcon className="w-5 h-5" />
                    <span className="text-xs font-semibold">Palma de Mallorca</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                A 5 min del centro histórico · 10 min de la playa · Aeropuerto a 20 min
              </p>
            </div>

            {/* Reviews */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-6">
                <svg viewBox="0 0 20 20" className="w-5 h-5 fill-gray-900">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-lg font-bold text-gray-900">{rating.toFixed(2)}</span>
                <span className="text-lg text-gray-500">· {reviewCount} reseñas</span>
                <button className="ml-auto text-sm font-semibold underline text-gray-900 hover:text-primary transition-colors">
                  Ver todas las reseñas disponibles
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {REVIEWS.map((r) => (
                  <div key={r.name}>
                    <div className="flex items-center gap-3 mb-3">
                      <img src={r.avatar} alt={r.name} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.date}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5 mb-2">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <svg key={i} viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-gray-900">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column – Booking card */}
          <div className="relative">
            <div className="sticky top-24">
              <div className="border border-gray-200 rounded-3xl shadow-xl p-6">
                {/* Price */}
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    <span className="text-2xl font-bold text-gray-900">${pricePerNight}</span>
                    <span className="text-gray-500 text-sm"> / noche</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-gray-900">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-semibold">{rating.toFixed(2)}</span>
                    <span className="text-gray-500">(128)</span>
                  </div>
                </div>

                {/* Date picker */}
                <div className="border border-gray-300 rounded-2xl overflow-hidden mb-3">
                  <div className="grid grid-cols-2">
                    <div className="p-3 border-r border-gray-200">
                      <p className="text-xs font-semibold text-gray-700">LLEGADA</p>
                      <p className="text-sm text-gray-900">08/05/2025</p>
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-semibold text-gray-700">SALIDA</p>
                      <p className="text-sm text-gray-900">12/05/2025</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 p-3">
                    <p className="text-xs font-semibold text-gray-700">HUÉSPEDES</p>
                    <p className="text-sm text-gray-900">2 huéspedes</p>
                  </div>
                </div>

                <Button variant="primary" size="lg" fullWidth className="mb-4">
                  Reservar ahora →
                </Button>

                <p className="text-xs text-center text-gray-400 mb-5">No se te cobrará nada todavía</p>

                {/* Price breakdown */}
                <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>${pricePerNight} × {selectedNights} noches</span>
                    <span>${pricePerNight * selectedNights}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>Tarifa de limpieza</span>
                    <span>${cleaningFee}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>Tarifa por servicio</span>
                    <span>${serviceFee}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1">
                    <span>Total acción de impuestos</span>
                    <span>${total}</span>
                  </div>
                </div>
              </div>

              {/* Report link */}
              <p className="text-center text-sm text-gray-500 underline cursor-pointer hover:text-gray-900 transition-colors mt-4">
                Reportar este anuncio
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer variant="simple" />
    </div>
  );
}
