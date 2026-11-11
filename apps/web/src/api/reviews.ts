import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from './http';
import { ApiError } from './identity';
import { isPropertyId, propertyKeys } from './properties';
import type { Booking, Review, ReviewPage } from '../types/catalog';

/**
 * Reviews through the Gateway. Reading a property's reviews (`GET /properties/:id/reviews`) uses a
 * provisional shape. Writing (RQ-11) is aligned to `openapi-reviews-service.yaml`:
 * `POST /reviews { bookingId, rating 1–5, comment 1–2000 }` → a review, only for a GUEST whose own
 * stay is COMPLETED; `GET /reviews/user/:id` lists own reviews.
 *
 * External dependency (G1): the Gateway does not expose `/reviews` yet; validated against MSW.
 */

export const reviewKeys = {
  all: ['reviews'] as const,
  property: (propertyId: string, page: number, pageSize: number) => [...reviewKeys.all, 'property', propertyId, page, pageSize] as const,
  user: (userId: string, page: number, pageSize: number) => [...reviewKeys.all, 'user', userId, page, pageSize] as const,
};

export async function getPropertyReviews(
  propertyId: string, { page = 1, pageSize = 5 }: { page?: number; pageSize?: number } = {}, signal?: AbortSignal,
): Promise<ReviewPage> {
  if (!isPropertyId(propertyId)) throw new ApiError(404, { code: 'NOT_FOUND' });
  const { data } = await http.get<ReviewPage>(`/properties/${propertyId}/reviews`, { params: { page, pageSize }, signal });
  return data;
}

export function usePropertyReviews(propertyId: string | undefined, page = 1, pageSize = 5) {
  return useQuery({
    queryKey: reviewKeys.property(propertyId ?? '', page, pageSize),
    queryFn: ({ signal }) => getPropertyReviews(propertyId ?? '', { page, pageSize }, signal),
    enabled: isPropertyId(propertyId),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Write (RQ-11)
// ---------------------------------------------------------------------------

export interface CreateReviewInput { bookingId: string; rating: number; comment: string }

/** Review as returned by the contract (`POST /reviews`): no author fields. */
export interface WrittenReview { id: string; propertyId: string; rating: number; comment: string; createdAt: string }

export interface UserReviewsPage { items: Review[]; page: number; pageSize: number; total: number; totalPages: number }

/** A stay can be reviewed only once it is COMPLETED (Bookings is the authority; this only gates the UI). */
export function isReviewable(booking: Pick<Booking, 'status' | 'checkOut'>, now: Date = new Date()): boolean {
  const today = now.toISOString().split('T')[0]!;
  return booking.status === 'COMPLETED' && booking.checkOut <= today;
}

export async function createReview(input: CreateReviewInput, signal?: AbortSignal): Promise<WrittenReview> {
  const { data } = await http.post<WrittenReview>('/reviews', {
    bookingId: input.bookingId, rating: input.rating, comment: input.comment.trim(),
  }, { signal });
  return data;
}

export function useCreateReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReviewInput) => createReview(input),
    onSuccess: (written) => {
      // Refresh the user's reviews, the property's reviews and its detail (average/count) — FE-038.
      void client.invalidateQueries({ queryKey: reviewKeys.all });
      void client.invalidateQueries({ queryKey: propertyKeys.detail(written.propertyId) });
    },
  });
}

export async function getUserReviews(
  userId: string, { page = 1, pageSize = 20 }: { page?: number; pageSize?: number } = {}, signal?: AbortSignal,
): Promise<UserReviewsPage> {
  const { data } = await http.get<UserReviewsPage>(`/reviews/user/${userId}`, { params: { page, pageSize }, signal });
  return data;
}

export function useUserReviews(userId: string | undefined, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: reviewKeys.user(userId ?? '', page, pageSize),
    queryFn: ({ signal }) => getUserReviews(userId ?? '', { page, pageSize }, signal),
    enabled: userId !== undefined,
  });
}

/** Safe copy for a review write/read failure, keyed by HTTP status. */
export function reviewWriteErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No pudimos publicar tu reseña. Intenta nuevamente.';
  switch (error.status) {
    case 400: return 'Revisa la calificación y el comentario.';
    case 401: return 'Tu sesión venció. Inicia sesión nuevamente.';
    case 403: return 'Solo puedes reseñar una estadía completada que hayas realizado.';
    case 404: return 'No encontramos la reserva.';
    case 409: return 'Ya dejaste una reseña para esta reserva.';
    default: return 'No pudimos publicar tu reseña. Intenta nuevamente.';
  }
}
