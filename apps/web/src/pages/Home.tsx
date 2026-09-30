import React, { useState, useMemo } from 'react';
import { Header } from '../components/Header';
import { PropertyCard } from '../components/PropertyCard';
import { Button } from '../components/Button';
import { ROOMS } from '../data/rooms';

interface HomeProps {
  onNavigate: (page: string, id?: string) => void;
}

const CATEGORIES = ['Todo', 'Playa', 'Montaña', 'Ciudad', 'Cabaña', 'Lujo', 'Piscina', 'Pet-friendly'];
const CAT_ICONS: Record<string, string> = {
  Todo: '🗺️', Playa: '🏖️', Montaña: '⛰️', Ciudad: '🌆', Cabaña: '🏕️', Lujo: '✨', Piscina: '🏊', 'Pet-friendly': '🐾',
};

export function Home({ onNavigate }: HomeProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todo');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [guests, setGuests] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return ROOMS.filter((r) => {
      const searchLower = search.toLowerCase();
      if (search && !r.location.toLowerCase().includes(searchLower) && !r.title.toLowerCase().includes(searchLower) && !r.country.toLowerCase().includes(searchLower)) return false;
      if (category !== 'Todo') {
        if (category === 'Piscina' && !r.amenities.some((a) => a.toLowerCase().includes('piscina') || a.toLowerCase().includes('alberca'))) return false;
        if (category === 'Pet-friendly' && !r.amenities.some((a) => a.toLowerCase().includes('pet'))) return false;
        if (!['Piscina', 'Pet-friendly'].includes(category) && r.category !== category) return false;
      }
      if (minPrice && r.pricePerNight < Number(minPrice)) return false;
      if (maxPrice && r.pricePerNight > Number(maxPrice)) return false;
      if (guests && r.maxGuests < Number(guests)) return false;
      return true;
    });
  }, [search, category, minPrice, maxPrice, guests]);

  const recommended = filtered.slice(0, 4);
  const featured = filtered.slice(4);
  const hasFilters = search || category !== 'Todo' || minPrice || maxPrice || guests;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header
        onNavigate={onNavigate}
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
      />

      {/* Category strip */}
      <div className="border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                category === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{CAT_ICONS[cat]}</span>
              {cat}
            </button>
          ))}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`ml-2 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${
              showFilters ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="9" cy="6" r="2" fill={showFilters ? 'white' : 'white'} /><circle cx="15" cy="12" r="2" fill="white" /><circle cx="9" cy="18" r="2" fill="white" />
            </svg>
            Filtros {(minPrice || maxPrice || guests) ? '·' : ''}
          </button>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="max-w-screen-xl mx-auto px-6 pb-4">
            <div className="flex flex-wrap gap-4 items-end bg-gray-50 rounded-2xl p-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">Precio mínimo / noche</label>
                <div className="flex items-center h-10 border border-gray-300 rounded-xl bg-white px-3 gap-1">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="0"
                    min={0}
                    className="w-20 text-sm outline-none bg-transparent"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">Precio máximo / noche</label>
                <div className="flex items-center h-10 border border-gray-300 rounded-xl bg-white px-3 gap-1">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="999"
                    min={0}
                    className="w-20 text-sm outline-none bg-transparent"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">Huéspedes mínimos</label>
                <select
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="h-10 px-3 border border-gray-300 rounded-xl bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#E31C5F]"
                >
                  <option value="">Cualquiera</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n}+ huéspedes</option>
                  ))}
                </select>
              </div>
              {hasFilters && (
                <button
                  onClick={() => { setSearch(''); setCategory('Todo'); setMinPrice(''); setMaxPrice(''); setGuests(''); }}
                  className="h-10 px-4 text-sm font-medium text-[#E31C5F] border border-[#E31C5F] rounded-xl hover:bg-[#fce7ef] transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
              <span className="text-sm text-gray-500 ml-auto self-center">
                {filtered.length} alojamiento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      <main className="flex-1 max-w-screen-xl mx-auto px-6 py-8 w-full">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4">🔍</span>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Sin resultados</h2>
            <p className="text-gray-500 text-sm mb-6">No encontramos alojamientos con esos filtros. Prueba ajustando la búsqueda.</p>
            <Button variant="outline" onClick={() => { setSearch(''); setCategory('Todo'); setMinPrice(''); setMaxPrice(''); setGuests(''); }}>
              Limpiar filtros
            </Button>
          </div>
        ) : (
          <>
            {/* Recommended */}
            {recommended.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold text-gray-900">
                    {hasFilters ? 'Resultados de búsqueda' : 'Recomendado para ti'}
                  </h2>
                  {!hasFilters && (
                    <button className="text-sm font-medium text-[#E31C5F] hover:underline">Ver todo →</button>
                  )}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-7">
                  {recommended.map((r) => (
                    <PropertyCard
                      key={r.id}
                      id={r.id}
                      image={r.images[0]}
                      title={r.title}
                      location={r.location}
                      rating={r.rating}
                      reviewCount={r.reviewCount}
                      pricePerNight={r.pricePerNight}
                      nights={3}
                      tag={r.tag}
                      onClick={() => onNavigate('detail', r.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Featured */}
            {featured.length > 0 && !hasFilters && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold text-gray-900">Propiedades destacadas y hoteles mejor valorados</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7">
                  {featured.map((r) => (
                    <PropertyCard
                      key={r.id}
                      id={r.id}
                      image={r.images[0]}
                      title={r.title}
                      location={r.location}
                      rating={r.rating}
                      reviewCount={r.reviewCount}
                      pricePerNight={r.pricePerNight}
                      nights={3}
                      tag={r.tag}
                      onClick={() => onNavigate('detail', r.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* All results when filtering */}
            {hasFilters && filtered.length > 4 && (
              <section className="mb-12">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7">
                  {filtered.slice(4).map((r) => (
                    <PropertyCard
                      key={r.id}
                      id={r.id}
                      image={r.images[0]}
                      title={r.title}
                      location={r.location}
                      rating={r.rating}
                      reviewCount={r.reviewCount}
                      pricePerNight={r.pricePerNight}
                      nights={3}
                      tag={r.tag}
                      onClick={() => onNavigate('detail', r.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Map CTA */}
            {!hasFilters && (
              <>
                <section className="mb-12">
                  <div className="flex flex-col lg:flex-row items-center gap-8 bg-gray-50 rounded-3xl p-8">
                    <div className="lg:w-1/2">
                      <h2 className="text-xl font-bold text-gray-900 mb-2">¿Prefieres elegir tu hotel por barrio o cercanía a atractivos?</h2>
                      <p className="text-sm text-gray-500 mb-5">Explora el mapa interactivo y encuentra el alojamiento perfecto en la zona que más te convenga.</p>
                      <Button variant="primary" size="md">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 1 1-14.14 14.14A10 10 0 0 1 19.07 4.93z" /></svg>
                        Ver Mapa Interactivo
                      </Button>
                    </div>
                    <div className="lg:w-1/2 w-full h-52 rounded-2xl overflow-hidden bg-gray-200 relative">
                      <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=700&h=400&fit=crop&auto=format" alt="Mapa" className="w-full h-full object-cover opacity-80" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-white rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                          <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none"><path d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z" fill="#E31C5F" /><circle cx="16" cy="15" r="4" fill="white" /></svg>
                          <span className="text-xs font-semibold text-gray-800">{ROOMS.length} propiedades aquí</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mb-12 bg-gray-900 rounded-3xl p-10 text-white relative overflow-hidden">
                  <div className="absolute inset-0 opacity-20">
                    <img src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&h=400&fit=crop&auto=format" alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                    <div className="max-w-lg">
                      <h2 className="text-2xl font-bold mb-2">¿Tienes un hotel, hostal o casa de huéspedes?</h2>
                      <p className="text-white/70 text-sm mb-6">StayHub te da acceso a millones de viajeros de todo el mundo.</p>
                      <div className="flex flex-wrap gap-8 mb-6">
                        {[{ value: '+38%', label: 'Reservas garantizadas' }, { value: '0%', label: 'Comisión el primer mes' }, { value: '24/7', label: 'Soporte para anfitriones' }].map((s) => (
                          <div key={s.value}>
                            <p className="text-2xl font-bold">{s.value}</p>
                            <p className="text-sm text-white/60">{s.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-3">
                        <Button variant="primary" size="md">Publicar ahora →</Button>
                        <Button variant="outline" size="md" className="!text-white !border-white/40 hover:!bg-white/10">Saber más</Button>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-screen-xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { title: 'Asistencia', links: ['Centro de ayuda', 'Información de seguridad', 'Opciones de cancelación'] },
            { title: 'Comunidad', links: ['StayHub.org', 'Programa de referidos', 'Viajeros accesibles'] },
            { title: 'Alojamiento', links: ['Publicar tu alojamiento', 'Recursos para anfitriones', 'Panel de gestión'] },
            { title: 'StayHub', links: ['Sala de prensa', 'Blog de viajes', 'Trabaja con nosotros'] },
          ].map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{col.title}</h3>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l}><button className="text-sm text-gray-500 hover:text-gray-900 transition-colors text-left">{l}</button></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200">
          <div className="max-w-screen-xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-sm text-gray-500">© 2026 StayHub, Inc.</span>
            <div className="flex gap-4">
              {['Privacidad', 'Condiciones', 'Empresa'].map((t) => (
                <button key={t} className="text-sm text-gray-500 hover:text-gray-800">{t}</button>
              ))}
            </div>
            <span className="text-sm text-gray-500">🌐 Español (ES)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
