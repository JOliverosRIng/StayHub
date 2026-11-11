import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useBooking } from '../../api/bookings';
import { ApiError } from '../../api/identity';
import { isReviewable, reviewWriteErrorMessage, useCreateReview } from '../../api/reviews';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';

/**
 * RQ-11 "rate property" (FE-037) at `/bookings/:bookingId/review`. Enabled only after a COMPLETED stay
 * (the booking is the source of truth via `isReviewable`). Submits `POST /reviews` (1–5 stars +
 * comment). On 401 it redirects to login keeping the destination; the server enforces ownership and
 * the completed-stay rule (403/404/409).
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-xl mx-auto px-6 py-10 w-full">{children}</main>
    </div>
  );
}

export function ReviewProperty() {
  const { bookingId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useBooking(bookingId);
  const createReview = useCreateReview();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [general, setGeneral] = useState<string>();
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const loadUnauthenticated = query.isError && query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (loadUnauthenticated) navigate(paths.login, { replace: true, state: { from: `${location.pathname}${location.search}` } });
  }, [loadUnauthenticated, navigate, location]);

  if (query.isPending || loadUnauthenticated) {
    return <Shell><p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando tu reserva…</p></Shell>;
  }
  if (query.isError) {
    return <Shell><div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{reviewWriteErrorMessage(query.error)}</div></Shell>;
  }

  const booking = query.data;

  const submit = () => {
    if (submitting.current) return;
    if (rating < 1 || !comment.trim()) { setGeneral('Elige una calificación y escribe un comentario.'); return; }
    submitting.current = true;
    setGeneral(undefined);
    createReview.mutate(
      { bookingId: booking.id, rating, comment },
      {
        onSuccess: () => { setDone(true); requestAnimationFrame(() => statusRef.current?.focus()); },
        onError: (error) => {
          submitting.current = false;
          if (error instanceof ApiError && error.status === 401) {
            navigate(paths.login, { replace: true, state: { from: `${location.pathname}${location.search}` } });
            return;
          }
          setGeneral(reviewWriteErrorMessage(error));
          requestAnimationFrame(() => statusRef.current?.focus());
        },
      },
    );
  };

  return (
    <Shell>
      <p className="text-sm text-primary font-semibold mb-1">Tu opinión</p>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">Calificar propiedad</h1>
      <p className="text-lg text-gray-700 mb-6">{booking.propertyName}</p>

      {done ? (
        <div ref={statusRef} tabIndex={-1} role="status" className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl focus:outline-none">
          <p className="font-semibold mb-3">¡Gracias por tu reseña!</p>
          <Link to={paths.property(booking.propertyId)} className="inline-flex items-center h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">Ver el alojamiento</Link>
        </div>
      ) : !isReviewable(booking) ? (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
          Solo puedes calificar una estadía completada.
        </div>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-700">Calificación</span>
            <div role="radiogroup" aria-label="Calificación" className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button"
                  aria-label={`${n} estrella${n === 1 ? '' : 's'}`} aria-pressed={rating === n}
                  onClick={() => { setRating(n); setGeneral(undefined); }}
                  className={`text-3xl leading-none ${n <= rating ? 'text-amber-500' : 'text-gray-300'} hover:text-amber-500`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="review-comment" className="text-xs font-semibold text-gray-700">Tu comentario</label>
            <textarea
              id="review-comment" rows={5} value={comment} maxLength={2000}
              onChange={(e) => { setComment(e.target.value); setGeneral(undefined); }}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
            />
            <p className="text-xs text-gray-400">{comment.length}/2000 caracteres</p>
          </div>

          {general && (
            <div ref={statusRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl focus:outline-none">
              {general}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="lg" loading={createReview.isPending}>Publicar reseña</Button>
            <Link to={paths.bookings} className="text-sm font-medium text-gray-600 hover:underline">Volver</Link>
          </div>
        </form>
      )}
    </Shell>
  );
}
