import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/identity';
import {
  formatLocation, formatMoney, lowestNightlyPrice, propertyErrorMessage, sortedPhotos, useProperty,
} from '../api/properties';
import { usePropertyReviews } from '../api/reviews';
import { paths } from '../app/navigation';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { BookingPanel } from '../components/property/BookingPanel';
import { LocationMap } from '../components/property/LocationMap';
import { PhotoGallery } from '../components/property/PhotoGallery';
import { ReviewsSection, Stars } from '../components/property/ReviewsSection';
import type { PendingBookingData } from '../types';
import { FEATURE_CATALOG, PROPERTY_TYPE_LABELS } from '../types/catalog';

interface PropertyDetailProps {
  propertyId: string;
  pendingBooking?: PendingBookingData | null;
  onBookingRequired: (data: PendingBookingData) => void;
  onBookingConfirmed: () => void;
}

const REVIEWS_PAGE = 5;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 py-6">{children}</main>
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-screen-xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">© 2026 StayHub, Inc. · Privacidad · Condiciones</p>
          <span className="text-sm text-gray-500">🌐 Español (ES)</span>
        </div>
      </footer>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando alojamiento…</span>
      <div aria-hidden className="animate-pulse">
        <div className="h-7 w-2/3 rounded bg-gray-200 mb-3" />
        <div className="h-4 w-1/3 rounded bg-gray-200 mb-6" />
        <div className="h-72 md:h-96 rounded-2xl bg-gray-200 mb-10" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
          <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 rounded bg-gray-200" />)}</div>
          <div className="h-64 rounded-3xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

/** RQ-06: full listing with photos, description, price, availability, reviews and map. */
export function PropertyDetail({ propertyId, pendingBooking, onBookingRequired, onBookingConfirmed }: PropertyDetailProps) {
  const navigate = useNavigate();
  const query = useProperty(propertyId);
  const [reviewsShown, setReviewsShown] = useState(REVIEWS_PAGE);
  const reviews = usePropertyReviews(query.data ? propertyId : undefined, 1, reviewsShown);

  if (query.isPending) return <Shell><DetailSkeleton /></Shell>;

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Shell>
        {notFound ? (
          <section className="flex flex-col items-center justify-center py-24 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">No encontramos este alojamiento</h1>
            <p className="text-sm text-gray-500 mb-6">{propertyErrorMessage(query.error)}</p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => navigate(paths.search)}>Buscar alojamientos</Button>
              <Button variant="outline" onClick={() => navigate(paths.home)}>Volver al inicio</Button>
            </div>
          </section>
        ) : (
          <div role="alert" className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <p className="text-gray-700">{propertyErrorMessage(query.error)}</p>
            <Button variant="outline" onClick={() => { void query.refetch(); }}>Reintentar</Button>
          </div>
        )}
      </Shell>
    );
  }

  const property = query.data;
  const photos = sortedPhotos(property);
  const fromPrice = lowestNightlyPrice(property);
  const average = reviews.data?.averageRating ?? null;
  const maxGuests = property.rooms.reduce((max, r) => Math.max(max, r.capacity), 0);

  return (
    <Shell>
      <nav aria-label="Migas de pan" className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <button onClick={() => navigate(paths.home)} className="hover:underline">Inicio</button>
        <span aria-hidden>/</span>
        <button onClick={() => navigate(paths.search)} className="hover:underline">Buscar</button>
        <span aria-hidden>/</span>
        <span className="text-gray-900 font-medium truncate" aria-current="page">{property.name}</span>
      </nav>

      {property.status !== 'PUBLISHED' && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {property.status === 'DRAFT' ? 'Borrador' : 'No publicada'}: solo tú puedes ver esta propiedad.
        </p>
      )}

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap text-sm">
          {average !== null && (
            <span className="flex items-center gap-1">
              <Stars rating={average} />
              <span className="font-semibold text-gray-900">{average.toFixed(2)}</span>
              <span className="text-gray-500">({reviews.data?.total} reseñas)</span>
            </span>
          )}
          <span className="text-gray-700">{formatLocation(property.location)}</span>
        </div>
      </div>

      <PhotoGallery propertyId={property.id} propertyName={property.name} photos={photos} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
        <div>
          <section className="pb-6 border-b border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-900">{PROPERTY_TYPE_LABELS[property.type]}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {property.rooms.length} habitaci{property.rooms.length === 1 ? 'ón' : 'ones'} · hasta {maxGuests} huéspedes
              {fromPrice && <> · desde {formatMoney(fromPrice.amount, fromPrice.currency)} / noche</>}
            </p>
          </section>

          <section aria-labelledby="description-heading" className="pb-6 border-b border-gray-200 mb-6">
            <h2 id="description-heading" className="text-lg font-bold text-gray-900 mb-3">Sobre este alojamiento</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {property.description || 'El anfitrión aún no agregó una descripción.'}
            </p>
          </section>

          <section aria-labelledby="rooms-heading" className="pb-6 border-b border-gray-200 mb-6">
            <h2 id="rooms-heading" className="text-lg font-bold text-gray-900 mb-4">Habitaciones y precios</h2>
            <ul className="flex flex-col gap-3">
              {property.rooms.map((room) => (
                <li key={room.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{room.name}</p>
                    <p className="text-xs text-gray-500">Hasta {room.capacity} huésped{room.capacity === 1 ? '' : 'es'}</p>
                  </div>
                  <p className="text-sm text-gray-900">
                    {room.basePrice ? <><strong>{formatMoney(room.basePrice.amount, room.basePrice.currency)}</strong> / noche</> : 'Precio no disponible'}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="features-heading" className="pb-6 border-b border-gray-200 mb-6">
            <h2 id="features-heading" className="text-lg font-bold text-gray-900 mb-4">Lo que ofrece este lugar</h2>
            {property.features.length === 0 ? (
              <p className="text-sm text-gray-500">El anfitrión aún no indicó características.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {property.features.map((f) => (
                  <li key={f.code} className="flex items-center gap-2 text-sm text-gray-700">
                    <span aria-hidden className="text-green-500">✓</span>{FEATURE_CATALOG.find((c) => c.code === f.code)?.name ?? f.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ReviewsSection reviews={reviews} onShowMore={() => setReviewsShown((n) => n + REVIEWS_PAGE)} />
          <LocationMap name={property.name} location={property.location} />
        </div>

        <aside aria-label="Reserva">
          <div className="sticky top-24">
            <BookingPanel
              property={property}
              pendingBooking={pendingBooking}
              onBookingRequired={onBookingRequired}
              onBookingConfirmed={onBookingConfirmed}
              onViewBookings={() => navigate(paths.bookings)}
            />
          </div>
        </aside>
      </div>
    </Shell>
  );
}
