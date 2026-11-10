import { renderHook, waitFor } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockToken, problem } from '../../test/msw/handlers';
import { OTHER_OWNER_ID, OWNER_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { createQueryWrapper } from '../../test/utils';
import { ApiError } from './identity';
import { session } from './session';
import {
  formatLocation, formatMoney, getProperty, lowestNightlyPrice, photoUrl, propertyErrorMessage, sortedPhotos, useProperty,
} from './properties';
import { getPropertyReviews, usePropertyReviews } from './reviews';

afterEach(() => vi.restoreAllMocks());

const signIn = (role: 'OWNER' | 'GUEST', sub: string) => vi.spyOn(session, 'accessToken').mockReturnValue(mockToken(role, sub));

describe('GET /properties/:id', () => {
  it('returns the full published property without ownerId for anonymous users', async () => {
    const property = await getProperty(PROPERTY_IDS.villa);
    expect(property).toMatchObject({ id: PROPERTY_IDS.villa, status: 'PUBLISHED', name: 'Villa Serena Boutique Hotel & Spa' });
    expect(property.rooms).toHaveLength(2);
    expect(property.features.map((f) => f.code)).toContain('POOL');
    expect(property.photos).toHaveLength(4);
    expect(property).not.toHaveProperty('ownerId');
  });

  it('includes ownerId and drafts only for the owner', async () => {
    signIn('OWNER', OWNER_ID);
    await expect(getProperty(PROPERTY_IDS.draft)).resolves.toMatchObject({ status: 'DRAFT', ownerId: OWNER_ID });
    vi.restoreAllMocks();
    signIn('OWNER', OTHER_OWNER_ID);
    await expect(getProperty(PROPERTY_IDS.draft)).rejects.toMatchObject({ status: 404 });
  });

  it('maps a missing or hidden property to 404', async () => {
    const error = await getProperty('00000000-0000-4000-8000-000000000000').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, problem: { code: 'NOT_FOUND' } });
    expect(propertyErrorMessage(error)).toBe('No encontramos este alojamiento. Puede que ya no esté publicado.');
    await expect(getProperty(PROPERTY_IDS.draft)).rejects.toMatchObject({ status: 404 });
  });

  it('treats a malformed id as not found without calling the API', async () => {
    const listener = vi.fn();
    server.events.on('request:start', listener);
    await expect(getProperty('not-a-uuid')).rejects.toMatchObject({ status: 404 });
    expect(listener).not.toHaveBeenCalled();
    server.events.removeAllListeners();
  });

  it('maps service failures to a retryable message', async () => {
    server.use(mock.get('*/api/v1/properties/:id', () => problem(503, 'UNAVAILABLE')));
    const error = await getProperty(PROPERTY_IDS.villa).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503 });
    expect(propertyErrorMessage(error)).toBe('No pudimos cargar el alojamiento. Intenta nuevamente.');
  });

  it('exposes the property through React Query and does not retry 404', async () => {
    let calls = 0;
    server.use(mock.get('*/api/v1/properties/:id', () => { calls += 1; return problem(404, 'NOT_FOUND'); }));
    const { result } = renderHook(() => useProperty(PROPERTY_IDS.villa), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toBe(1);
  });
});

describe('GET /properties/:id/reviews', () => {
  it('returns a page of reviews newest first with the average rating', async () => {
    const page = await getPropertyReviews(PROPERTY_IDS.villa, { page: 1, pageSize: 2 });
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3, hasNext: true, averageRating: 4.67 });
    expect(page.items.map((r) => r.comment)).toEqual(['Volveremos sin duda.', 'Muy cómodo; el desayuno podría tener más variedad.']);
    expect(page.items[0]).toMatchObject({ rating: 5, propertyId: PROPERTY_IDS.villa, authorName: 'Marta' });
  });

  it('returns an empty page with null average for properties without reviews', async () => {
    await expect(getPropertyReviews(PROPERTY_IDS.loft)).resolves.toMatchObject({ items: [], total: 0, averageRating: null });
  });

  it('fails with 404 for a property that is not visible', async () => {
    await expect(getPropertyReviews(PROPERTY_IDS.draft)).rejects.toMatchObject({ status: 404 });
    await expect(getPropertyReviews('bad-id')).rejects.toMatchObject({ status: 404 });
  });

  it('exposes reviews through React Query', async () => {
    const { result } = renderHook(() => usePropertyReviews(PROPERTY_IDS.casaAzul), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
  });

  it('keeps contract errors as ApiError', async () => {
    server.use(mock.get('*/api/v1/properties/:id/reviews', () => HttpResponse.error()));
    await expect(getPropertyReviews(PROPERTY_IDS.villa)).rejects.toMatchObject({ status: 0 });
  });
});

describe('property presentation helpers', () => {
  it('picks the lowest priced room and formats money and location', async () => {
    const property = await getProperty(PROPERTY_IDS.villa);
    expect(lowestNightlyPrice(property)).toEqual({ amount: '195.00', currency: 'EUR' });
    expect(formatMoney('195.00', 'EUR')).toMatch(/195/);
    expect(formatMoney('10', 'NOPE')).toBe('10 NOPE');
    expect(formatLocation(property.location)).toBe('Palma de Mallorca, Islas Baleares, ES');
  });

  it('orders photos by position and derives a Gateway URL when no url is provided', async () => {
    const property = await getProperty(PROPERTY_IDS.villa);
    expect(sortedPhotos({ ...property, photos: [...property.photos].reverse() }).map((p) => p.position)).toEqual([0, 1, 2, 3]);
    expect(photoUrl(property.id, property.photos[0]!)).toBe(property.photos[0]!.url);
    const { url: _url, ...bare } = property.photos[0]!;
    void _url;
    expect(photoUrl(property.id, bare)).toBe(`/api/v1/properties/${property.id}/photos/${bare.id}`);
  });
});
