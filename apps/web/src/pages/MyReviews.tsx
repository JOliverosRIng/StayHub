import { Link } from 'react-router-dom';
import { ApiError } from '../api/identity';
import { useUserReviews } from '../api/reviews';
import { paths } from '../app/navigation';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { Stars } from '../components/property/ReviewsSection';
import { useAuth } from '../context/AuthContext';

interface MyReviewsProps {
  onNavigate: (page: string, id?: string) => void;
}

const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * RQ-11 (FE-038) — the guest's own reviews (`GET /reviews/user/:id`). Each review carries only its
 * propertyId (the contract Review has no property name), so each row links to the property detail.
 * External dependency (G1): the Gateway does not expose `/reviews` yet; validated against MSW.
 */
export function MyReviews({ onNavigate }: MyReviewsProps) {
  const { currentUser } = useAuth();
  const query = useUserReviews(currentUser?.id);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header onNavigate={onNavigate} />
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Inicia sesión para ver tus reseñas</h2>
          <p className="text-gray-500 text-sm mb-6">Necesitas una cuenta para acceder a esta sección.</p>
          <Button variant="primary" size="lg" onClick={() => onNavigate('login')}>Iniciar sesión</Button>
        </div>
      </div>
    );
  }

  const errorMessage = query.error instanceof ApiError && query.error.status === 401
    ? 'Tu sesión venció. Inicia sesión nuevamente.'
    : 'No pudimos cargar tus reseñas. Intenta nuevamente.';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header onNavigate={onNavigate} />
      <main className="flex-1 max-w-screen-lg mx-auto px-6 py-10 w-full">
        <p className="text-sm text-primary font-semibold mb-1">Tu cuenta</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Mis reseñas</h1>

        {query.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            <p>{errorMessage}</p>
            <button type="button" onClick={() => query.refetch()} className="font-semibold underline">Reintentar</button>
          </div>
        ) : query.isPending ? (
          <p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando tus reseñas…</p>
        ) : query.data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Todavía no has escrito reseñas</h2>
            <p className="text-gray-500 text-sm mb-6">Califica un alojamiento después de completar tu estadía.</p>
            <Link to={paths.bookings} className="h-11 inline-flex items-center px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Ver mis reservas</Link>
          </div>
        ) : (
          <ul aria-label="Mis reseñas" className="flex flex-col gap-4">
            {query.data.items.map((review) => (
              <li key={review.id} className="flex flex-col gap-1 rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between gap-4">
                  <Stars rating={review.rating} />
                  <time dateTime={review.createdAt} className="text-xs text-gray-500">{dateFormat.format(new Date(review.createdAt))}</time>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>
                <Link to={paths.property(review.propertyId)} className="mt-1 text-sm font-semibold text-primary hover:underline">Ver alojamiento</Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
