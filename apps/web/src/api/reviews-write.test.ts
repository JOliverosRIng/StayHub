import { renderHook, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockDb, mockToken, problem } from '../../test/msw/handlers';
import { BOOKING_IDS, GUEST_ID, OTHER_GUEST_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { createQueryWrapper, createTestQueryClient } from '../../test/utils';
import { ApiError } from './identity';
import { session } from './session';
import {
  createReview, getUserReviews, isReviewable, reviewWriteErrorMessage, useCreateReview, useUserReviews,
} from './reviews';
import type { Booking, Review } from '../types/catalog';

/**
 * FE-036 (RQ-11) — review write client, test-first. Extends `./reviews` (FE-037), which already reads
 * property reviews. Aligned to `openapi-reviews-service.yaml`: `POST /reviews { bookingId, rating 1–5,
 * comment 1–2000 }` → Review; only the GUEST of a booking whose stay is COMPLETED may review; one
 * review per booking (409). `GET /reviews/user/:id` lists own reviews (no 404 in the contract).
 *
 * External dependency (G1): the Gateway does not expose `/reviews` yet; validated against MSW.
 * Expected RED until FE-037 implements createReview/useCreateReview/getUserReviews/useUserReviews/
 * isReviewable/reviewWriteErrorMessage.
 */

const review = (over: Partial<{ bookingId: string; rating: number; comment: string }> = {}) =>
  ({ bookingId: BOOKING_IDS.villaCompleted, rating: 5, comment: 'Excelente estadía.', ...over });

let token: string | undefined;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  token = mockToken('GUEST', GUEST_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('POST /reviews', () => {
  it('creates a review for a completed stay and returns it (201)', async () => {
    let authorization: string | null = null;
    server.events.on('request:start', ({ request }) => { if (request.method === 'POST') authorization = request.headers.get('Authorization'); });
    const created = await createReview(review({ comment: '  Excelente estadía.  ' }));
    server.events.removeAllListeners();
    expect(authorization).toBe(`Bearer ${token}`);
    expect(created).toMatchObject({ propertyId: PROPERTY_IDS.villa, rating: 5, comment: 'Excelente estadía.' });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
  });

  it('requires an authenticated session (401)', async () => {
    token = undefined;
    const error = await createReview(review()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(reviewWriteErrorMessage(error)).toBe('Tu sesión venció. Inicia sesión nuevamente.');
  });

  it('validates rating range and comment (400 by field)', async () => {
    const badRating = await createReview(review({ rating: 6 })).catch((e: unknown) => e);
    expect(badRating).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect((badRating as ApiError).problem?.errors?.map((e) => e.field)).toContain('rating');
    expect(reviewWriteErrorMessage(badRating)).toBe('Revisa la calificación y el comentario.');
    const emptyComment = await createReview(review({ comment: '   ' })).catch((e: unknown) => e);
    expect((emptyComment as ApiError).problem?.errors?.map((e) => e.field)).toContain('comment');
  });

  it('rejects a stay that is not completed (403)', async () => {
    const error = await createReview(review({ bookingId: BOOKING_IDS.casaAzulConfirmed })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403 });
    expect(reviewWriteErrorMessage(error)).toBe('Solo puedes reseñar una estadía completada que hayas realizado.');
  });

  it('forbids reviewing a booking of another guest (403)', async () => {
    const error = await createReview(review({ bookingId: BOOKING_IDS.cabanaCancelled })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403 });
  });

  it('allows only one review per booking (409)', async () => {
    await createReview(review());
    const error = await createReview(review()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409 });
    expect(reviewWriteErrorMessage(error)).toBe('Ya dejaste una reseña para esta reserva.');
  });

  it('maps a missing booking to 404', async () => {
    const error = await createReview(review({ bookingId: '00000000-0000-4000-8000-0000000000dd' })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, problem: { code: 'NOT_FOUND' } });
    expect(reviewWriteErrorMessage(error)).toBe('No encontramos la reserva.');
  });

  it('maps a server failure (5xx) to a retryable message', async () => {
    server.use(mock.post('*/api/v1/reviews', () => problem(503, 'UNAVAILABLE')));
    const error = await createReview(review()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503 });
    expect(reviewWriteErrorMessage(error)).toBe('No pudimos publicar tu reseña. Intenta nuevamente.');
  });
});

describe('isReviewable (completed-stay rule)', () => {
  it('only a completed stay in the past is reviewable (clock frozen at 2026-11-10)', () => {
    const completed = mockDb.booking(BOOKING_IDS.villaCompleted)!; // COMPLETED, checkOut 2026-09-08
    const confirmed = mockDb.booking(BOOKING_IDS.casaAzulConfirmed)!; // CONFIRMED, checkOut 2026-12-14
    expect(isReviewable(completed)).toBe(true);
    expect(isReviewable(confirmed)).toBe(false);
    const completedButFuture: Booking = { ...completed, checkOut: '2099-01-01' };
    expect(isReviewable(completedButFuture)).toBe(false);
  });
});

describe('GET /reviews/user/:id', () => {
  it('lists the user reviews with property, rating, comment and date', async () => {
    const created = await createReview(review({ comment: 'Volvería sin dudarlo.' }));
    const page = await getUserReviews(GUEST_ID);
    const mine = page.items.find((r: Review) => r.id === created.id)!;
    expect(mine).toMatchObject({ propertyId: PROPERTY_IDS.villa, rating: 5, comment: 'Volvería sin dudarlo.' });
    expect(mine.createdAt).toBeTruthy();
  });

  it('returns an empty page for a user with no reviews', async () => {
    token = mockToken('GUEST', OTHER_GUEST_ID);
    const page = await getUserReviews(OTHER_GUEST_ID);
    expect(page).toMatchObject({ total: 0 });
    expect(page.items).toEqual([]);
  });

  it('requires a session (401) and forbids listing another user (403)', async () => {
    token = undefined;
    await expect(getUserReviews(GUEST_ID)).rejects.toMatchObject({ status: 401 });
    token = mockToken('GUEST', GUEST_ID);
    await expect(getUserReviews(OTHER_GUEST_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe('React Query hooks', () => {
  it('useCreateReview creates and refreshes the user reviews without a reload', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => ({ list: useUserReviews(GUEST_ID), create: useCreateReview() }),
      { wrapper: createQueryWrapper(client) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    result.current.create.mutate(review({ comment: 'Reseña vía React Query.' }));

    await waitFor(() => expect(result.current.list.data?.items.some((r: Review) => r.comment === 'Reseña vía React Query.')).toBe(true));
  });
});
