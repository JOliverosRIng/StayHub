import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockToken } from '../../test/msw/handlers';
import { GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { createQueryWrapper, createTestQueryClient } from '../../test/utils';
import { ApiError } from './identity';
import { session } from './session';
import {
  fieldErrors, getProperty, propertyKeys, propertyWriteErrorMessage, saveProperty, toReplaceInput, useUpdateProperty,
} from './properties';

/**
 * FE-021 (RQ-03) — edit client, test-first.
 *
 * Covers the edit path of the accommodations contract (`PUT /properties/:id`): preloading the form
 * from the current property, saving only the editable fields, carrying the session bearer and the
 * optimistic-concurrency version, and mapping 200/400/401/403/404 (plus the 409 version conflict the
 * UI must surface) to user-facing copy. Runs entirely against MSW; it never reaches the real backend.
 *
 * `saveProperty` and `useUpdateProperty` are implemented in FE-022, so this suite is expected to be
 * RED until then; preload reuses the existing `getProperty`/`toReplaceInput` data layer.
 */

afterEach(() => vi.restoreAllMocks());

// The HTTP client reads the bearer per request from the session (see api/http.ts); the spy lets each
// test switch the caller without touching the real token store.
let token: string | undefined;
beforeEach(() => {
  token = mockToken('OWNER', OWNER_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});

describe('precarga del formulario de edición', () => {
  it('maps the current property to the editable form values', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    const preload = toReplaceInput(property);
    expect(preload).toMatchObject({
      type: 'HOUSE',
      name: 'Casa Azul Frente al Mar',
      description: property.description,
      status: 'PUBLISHED',
      version: 1,
      featureCodes: ['WIFI', 'KITCHEN', 'PETS_ALLOWED', 'POOL'],
    });
    expect(preload.location).toEqual(property.location);
    expect(preload.rooms).toEqual([
      { id: property.rooms[0]!.id, name: 'Casa completa', capacity: 6, basePrice: { amount: '145.00', currency: 'USD' } },
    ]);
  });
});

describe('PUT /properties/:id — guardado de la edición', () => {
  it('saves the editable fields and returns the new version (200)', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    let sent: Record<string, unknown> | undefined;
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PUT') sent = await request.clone().json();
    });
    const updated = await saveProperty(property, { name: '  Casa Azul Renovada ', description: 'Remodelada en 2026.' });
    server.events.removeAllListeners();
    // Only the editable representation travels; id/ownerId/photos/timestamps are never sent on PUT.
    expect(Object.keys(sent as object).sort()).toEqual(
      ['description', 'featureCodes', 'location', 'name', 'rooms', 'status', 'type', 'version'],
    );
    expect(updated).toMatchObject({
      id: PROPERTY_IDS.casaAzul, name: 'Casa Azul Renovada', description: 'Remodelada en 2026.', status: 'PUBLISHED', version: 2,
    });
  });

  it('attaches the session bearer to the request', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    let authorization: string | null = null;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') authorization = request.headers.get('Authorization');
    });
    await saveProperty(property, { name: 'Con bearer' });
    server.events.removeAllListeners();
    expect(authorization).toBe(`Bearer ${token}`);
  });

  it('surfaces validation errors by field (400)', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    const error = await saveProperty(property, { name: '', featureCodes: ['JACUZZI'] }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect(fieldErrors(error).sort()).toEqual(['featureCodes', 'name']);
    expect(propertyWriteErrorMessage(error)).toBe('Revisa los datos marcados en el formulario.');
  });

  it('requires an authenticated session (401)', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    token = undefined;
    const error = await saveProperty(property, { name: 'Sin sesión' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(propertyWriteErrorMessage(error)).toBe('Tu sesión venció. Inicia sesión nuevamente.');
  });

  it('rejects a non-owner session (403)', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    token = mockToken('GUEST', GUEST_ID);
    const error = await saveProperty(property, { name: 'Como huésped' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403 });
    expect(propertyWriteErrorMessage(error)).toBe('Solo los propietarios pueden publicar alojamientos.');
  });

  it('maps a property the owner does not own to 404', async () => {
    // Hacienda is PUBLISHED (so it preloads) but belongs to another owner, so editing it is a 404.
    const property = await getProperty(PROPERTY_IDS.hacienda);
    const error = await saveProperty(property, { name: 'Ajena' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, problem: { code: 'NOT_FOUND' } });
    expect(propertyWriteErrorMessage(error)).toBe('No encontramos la propiedad o no te pertenece.');
  });

  it('reports an optimistic-concurrency conflict (409) when the version is stale', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    await saveProperty(property, { name: 'Primera edición' }); // moves the server to version 2
    const error = await saveProperty(property, { name: 'Edición con versión vieja' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, problem: { code: 'VERSION_CONFLICT' } });
    expect(propertyWriteErrorMessage(error)).toBe('La propiedad cambió mientras la editabas. Recarga para ver la última versión.');
  });
});

describe('useUpdateProperty', () => {
  it('saves through React Query and refreshes the cached detail', async () => {
    const property = await getProperty(PROPERTY_IDS.casaAzul);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useUpdateProperty(), { wrapper: createQueryWrapper(client) });

    result.current.mutate({ property, changes: { name: 'Vía React Query' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ name: 'Vía React Query', version: 2 });
    expect(client.getQueryData(propertyKeys.detail(PROPERTY_IDS.casaAzul))).toMatchObject({ name: 'Vía React Query', version: 2 });
  });
});
