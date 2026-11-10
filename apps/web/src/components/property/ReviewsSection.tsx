import type { UseQueryResult } from '@tanstack/react-query';
import type { ReviewPage } from '../../types/catalog';

interface ReviewsSectionProps {
  reviews: UseQueryResult<ReviewPage>;
  onShowMore: () => void;
}

const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });

export function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating} de 5 estrellas`} className="text-[#E31C5F] tracking-tight">
      {'★'.repeat(rounded)}<span className="text-gray-300">{'★'.repeat(5 - rounded)}</span>
    </span>
  );
}

export function ReviewsSection({ reviews, onShowMore }: ReviewsSectionProps) {
  const data = reviews.data;
  return (
    <section aria-labelledby="reviews-heading" className="pb-6 border-b border-gray-200 mb-6">
      <h2 id="reviews-heading" className="text-lg font-bold text-gray-900 mb-3">
        Reseñas{data && data.total > 0 ? ` (${data.total})` : ''}
      </h2>
      {reviews.isError && !data ? (
        <div role="alert" className="text-sm text-gray-600">
          No pudimos cargar las reseñas.{' '}
          <button type="button" onClick={() => { void reviews.refetch(); }} className="font-semibold underline">Reintentar</button>
        </div>
      ) : !data ? (
        <p role="status" className="text-sm text-gray-500">Cargando reseñas…</p>
      ) : data.total === 0 ? (
        <p className="text-sm text-gray-500">Este alojamiento aún no tiene reseñas.</p>
      ) : (
        <>
          {data.averageRating !== null && (
            <p className="flex items-center gap-2 text-sm text-gray-700 mb-4">
              <Stars rating={data.averageRating} />
              <span><strong>{data.averageRating.toFixed(2)}</strong> de promedio</span>
            </p>
          )}
          <ul className="flex flex-col gap-5">
            {data.items.map((review) => (
              <li key={review.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                    {(review.authorName ?? 'H').charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{review.authorName ?? 'Huésped'}</p>
                    <p className="text-xs text-gray-500"><time dateTime={review.createdAt}>{dateFormat.format(new Date(review.createdAt))}</time></p>
                  </div>
                </div>
                <Stars rating={review.rating} />
                <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>
              </li>
            ))}
          </ul>
          {data.hasNext && (
            <button
              type="button"
              onClick={onShowMore}
              disabled={reviews.isFetching}
              className="mt-5 h-10 px-5 rounded-xl border border-gray-300 text-sm font-medium hover:border-gray-400 disabled:opacity-50"
            >
              {reviews.isFetching ? 'Cargando…' : 'Mostrar más reseñas'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
