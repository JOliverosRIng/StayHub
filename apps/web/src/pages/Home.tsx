import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchErrorMessage, toSearchParams, useSearch } from '../api/search';
import { paths, type NoticeLocationState } from '../app/navigation';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { CategoryPills } from '../components/home/CategoryPills';
import { PropertyCard } from '../components/property/PropertyCard';
import { ALL_CATEGORY, AMENITY_CATEGORIES } from '../data/categories';
import { DEV_FALLBACK_ENABLED, DEV_FALLBACK_PROPERTIES } from '../data/properties';
import type { Property } from '../types';
import { toCardProps } from './Search';

const HOME_PAGE_SIZE = 12;

interface HomeProps {
  /** Show example cards when search is unreachable. Defaults to development builds only. */
  fallback?: boolean;
}

interface Card { id: string; props: Omit<Property, 'id'> }

export function Home({ fallback = DEV_FALLBACK_ENABLED }: HomeProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as NoticeLocationState | null)?.notice;
  const [query, setQuery] = useState('');
  const search = useSearch({ pageSize: HOME_PAGE_SIZE }, { debounceMs: 0 });

  const usingFallback = search.isError && !search.data && fallback;
  // `import.meta.env.DEV` is statically false in production, so the example data is tree-shaken there.
  const examples = import.meta.env.DEV ? DEV_FALLBACK_PROPERTIES : [];
  const cards: Card[] = usingFallback
    ? examples.map(({ id, ...props }) => ({ id, props }))
    : (search.data?.items ?? []).map((r) => ({ id: r.accommodationId, props: toCardProps(r) }));
  const total = usingFallback ? cards.length : search.data?.total ?? 0;
  const recommended = cards.slice(0, 4);
  const featured = cards.slice(4);

  const goSearch = (q: string) => {
    const params = toSearchParams({ q });
    navigate(params.size ? `${paths.search}?${params}` : paths.search);
  };
  const goCategory = (label: string) => {
    const amenity = AMENITY_CATEGORIES.find((c) => c.label === label)?.amenity;
    const params = toSearchParams({ amenities: amenity ? [amenity] : undefined });
    navigate(params.size ? `${paths.search}?${params}` : paths.search);
  };

  const grid = (items: Card[], className: string) => (
    <ul className={className}>
      {items.map((card) => (
        <li key={card.id}>
          <PropertyCard {...card.props} onClick={() => navigate(paths.property(card.id))} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header showSearch searchValue={query} onSearchChange={setQuery} onSearchSubmit={goSearch} />

      {notice && (
        <p role="status" className="max-w-screen-xl mx-auto mt-4 w-[calc(100%-3rem)] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </p>
      )}

      <div className="border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 py-3">
          <CategoryPills categories={AMENITY_CATEGORIES} active={ALL_CATEGORY} onChange={goCategory} />
        </div>
      </div>

      <main className="flex-1 max-w-screen-xl mx-auto px-6 py-8 w-full">
        {usingFallback && (
          <p role="status" className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Mostrando alojamientos de ejemplo: el servicio de búsqueda no está disponible en este entorno de desarrollo.
          </p>
        )}

        {search.isError && !search.data && !fallback ? (
          <div role="alert" className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <p className="text-gray-700">{searchErrorMessage(search.error)}</p>
            <Button variant="outline" onClick={() => { void search.refetch(); }}>Reintentar</Button>
          </div>
        ) : !search.data && !usingFallback ? (
          <p role="status" className="py-24 text-center text-sm text-gray-500">Cargando alojamientos…</p>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Aún no hay alojamientos publicados</h2>
            <p className="text-gray-500 text-sm">Vuelve pronto o publica el tuyo.</p>
          </div>
        ) : (
          <>
            <section className="mb-12" aria-labelledby="recommended-heading">
              <div className="flex items-center justify-between mb-5">
                <h2 id="recommended-heading" className="text-xl font-bold text-gray-900">Recomendado para ti</h2>
                <button onClick={() => navigate(paths.search)} className="text-sm font-medium text-[#E31C5F] hover:underline">Ver todo →</button>
              </div>
              {grid(recommended, 'grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-7')}
            </section>

            {featured.length > 0 && (
              <section className="mb-12" aria-labelledby="featured-heading">
                <h2 id="featured-heading" className="text-xl font-bold text-gray-900 mb-5">Propiedades destacadas y hoteles mejor valorados</h2>
                {grid(featured, 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7')}
              </section>
            )}
          </>
        )}

        <section className="mb-12">
          <div className="flex flex-col lg:flex-row items-center gap-8 bg-gray-50 rounded-3xl p-8">
            <div className="lg:w-1/2">
              <h2 className="text-xl font-bold text-gray-900 mb-2">¿Prefieres elegir tu hotel por barrio o cercanía a atractivos?</h2>
              <p className="text-sm text-gray-500 mb-5">Busca por ciudad o región y filtra por fechas, precio y amenidades.</p>
              <Button variant="primary" size="md" onClick={() => navigate(paths.search)}>
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 1 1-14.14 14.14A10 10 0 0 1 19.07 4.93z" /></svg>
                Explorar alojamientos
              </Button>
            </div>
            <div className="lg:w-1/2 w-full h-52 rounded-2xl overflow-hidden bg-gray-200 relative">
              <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=700&h=400&fit=crop&auto=format" alt="" className="w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                  <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none" aria-hidden><path d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z" fill="#E31C5F" /><circle cx="16" cy="15" r="4" fill="white" /></svg>
                  <span className="text-xs font-semibold text-gray-800">{total} propiedades disponibles</span>
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
                <Button variant="primary" size="md" onClick={() => navigate(paths.hostNew)}>Publicar ahora →</Button>
                <Button variant="outline" size="md" className="!text-white !border-white/40 hover:!bg-white/10">Saber más</Button>
              </div>
            </div>
          </div>
        </section>
      </main>

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
