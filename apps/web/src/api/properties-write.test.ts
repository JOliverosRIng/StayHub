import { http as mock } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { mockDb, mockToken, problem } from '../../test/msw/handlers';
import { GUEST_ID, OWNER_ID, PROPERTY_IDS } from '../../test/msw/fixtures';
import { ApiError } from './identity';
import { session } from './session';
import {
  createProperty, fieldErrors, publishProperty, propertyWriteErrorMessage, toReplaceInput, uploadPropertyPhoto, validatePhotoFile,
} from './properties';
import { CATALOG_LIMITS, type PropertyCreate } from '../types/catalog';

const input: PropertyCreate = {
  type: 'HOUSE', name: '  Casa del Lago ', description: 'Frente al lago.',
  location: { addressLine: 'Ruta 40 km 3', city: 'Villa La Angostura', region: 'Neuquén', country: 'AR' },
  featureCodes: ['WIFI', 'PARKING'],
  rooms: [{ name: 'Principal', capacity: 4, basePrice: { amount: '150.00', currency: 'USD' } }],
};

const jpeg = (bytes = 1024, type = 'image/jpeg', name = 'foto.jpg') => new File([new Uint8Array(bytes)], name, { type });

let token: string | undefined;
beforeEach(() => {
  token = mockToken('OWNER', OWNER_ID);
  vi.spyOn(session, 'accessToken').mockImplementation(() => token);
});
afterEach(() => vi.restoreAllMocks());

describe('POST /properties', () => {
  it('creates a draft owned by the caller with exactly the contract fields', async () => {
    let body: unknown;
    server.events.on('request:start', async ({ request }) => { if (request.method === 'POST') body = await request.clone().json(); });
    const created = await createProperty(input);
    server.events.removeAllListeners();
    expect(Object.keys(body as object).sort()).toEqual(['description', 'featureCodes', 'location', 'name', 'rooms', 'type']);
    expect(created).toMatchObject({ status: 'DRAFT', version: 1, ownerId: OWNER_ID, name: 'Casa del Lago' });
    expect(created.features.map((f) => f.code)).toEqual(['WIFI', 'PARKING']);
    expect(created.rooms[0]).toMatchObject({ name: 'Principal', capacity: 4, basePrice: { amount: '150.00', currency: 'USD' } });
  });

  it('requires an authenticated owner', async () => {
    token = undefined;
    await expect(createProperty(input)).rejects.toMatchObject({ status: 401 });
    token = mockToken('GUEST', GUEST_ID);
    const error = await createProperty(input).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403 });
    expect(propertyWriteErrorMessage(error)).toBe('Solo los propietarios pueden publicar alojamientos.');
  });

  it('surfaces validation errors by field', async () => {
    const error = await createProperty({ ...input, featureCodes: ['JACUZZI'], rooms: [] }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, problem: { code: 'VALIDATION_ERROR' } });
    expect(fieldErrors(error)).toEqual(['featureCodes', 'rooms']);
    expect(propertyWriteErrorMessage(error)).toBe('Revisa los datos marcados en el formulario.');
  });
});

describe('POST /properties/:id/photos', () => {
  it('uploads one multipart file and returns its metadata', async () => {
    let contentType: string | null = null;
    server.events.on('request:start', ({ request }) => { contentType = request.headers.get('Content-Type'); });
    const photo = await uploadPropertyPhoto(PROPERTY_IDS.villa, jpeg(2048));
    server.events.removeAllListeners();
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(photo).toMatchObject({ mediaType: 'image/jpeg', byteSize: 2048, position: 4 });
    expect(mockDb.property(PROPERTY_IDS.villa)!.photos).toHaveLength(5);
  });

  it.each([
    [jpeg(CATALOG_LIMITS.photoMaxBytes + 1), 'La foto supera 5 MB (5 000 000 bytes).'],
    [jpeg(0), 'El archivo está vacío.'],
    [jpeg(10, 'image/gif', 'a.gif'), 'Solo se aceptan fotos JPEG, PNG o WebP.'],
  ])('rejects invalid files locally without a request (%#)', async (file, message) => {
    const listener = vi.fn();
    server.events.on('request:start', listener);
    expect(validatePhotoFile(file)).toBe(message);
    const error = await uploadPropertyPhoto(PROPERTY_IDS.villa, file).catch((e: unknown) => e);
    server.events.removeAllListeners();
    expect(error).toBeInstanceOf(ApiError);
    expect(propertyWriteErrorMessage(error)).toBe(message);
    expect(listener).not.toHaveBeenCalled();
  });

  it('accepts exactly 5 000 000 bytes (decimal limit)', () => {
    expect(validatePhotoFile(jpeg(CATALOG_LIMITS.photoMaxBytes))).toBeUndefined();
    expect(validatePhotoFile(jpeg(10, 'image/png'))).toBeUndefined();
    expect(validatePhotoFile(jpeg(10, 'image/webp'))).toBeUndefined();
  });

  it.each([
    [413, 'PHOTO_TOO_LARGE', 'La foto supera 5 MB (5 000 000 bytes).'],
    [415, 'PHOTO_MEDIA_TYPE', 'Solo se aceptan fotos JPEG, PNG o WebP.'],
    [409, 'PHOTO_LIMIT_REACHED', `Alcanzaste el máximo de ${CATALOG_LIMITS.photosPerProperty} fotos por propiedad.`],
    [404, 'NOT_FOUND', 'No encontramos la propiedad o no te pertenece.'],
    [503, 'UNAVAILABLE', 'El servicio no está disponible. Intenta nuevamente.'],
  ])('maps server %i %s', async (status, code, message) => {
    server.use(mock.post('*/api/v1/properties/:id/photos', () => problem(status, code)));
    const error = await uploadPropertyPhoto(PROPERTY_IDS.villa, jpeg()).catch((e: unknown) => e);
    expect(error).toMatchObject({ status, problem: { code } });
    expect(propertyWriteErrorMessage(error)).toBe(message);
  });

  it('enforces the ten-photo limit in the mock contract', async () => {
    const created = await createProperty(input);
    for (let i = 0; i < CATALOG_LIMITS.photosPerProperty; i += 1) await uploadPropertyPhoto(created.id, jpeg());
    await expect(uploadPropertyPhoto(created.id, jpeg())).rejects.toMatchObject({ status: 409, problem: { code: 'PHOTO_LIMIT_REACHED' } });
  });
});

describe('publishing', () => {
  it('replaces the full representation with status PUBLISHED and the current version', async () => {
    const created = await createProperty(input);
    await uploadPropertyPhoto(created.id, jpeg());
    const replace = toReplaceInput(created, { status: 'PUBLISHED' });
    expect(replace).toEqual({
      type: 'HOUSE', name: 'Casa del Lago', description: 'Frente al lago.', location: input.location,
      featureCodes: ['WIFI', 'PARKING'], status: 'PUBLISHED', version: 1,
      rooms: [{ id: created.rooms[0]!.id, name: 'Principal', capacity: 4, basePrice: { amount: '150.00', currency: 'USD' } }],
    });
    await expect(publishProperty(created)).resolves.toMatchObject({ status: 'PUBLISHED', version: 2 });
  });

  it('explains incomplete publication', async () => {
    const created = await createProperty(input);
    const error = await publishProperty(created).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, problem: { code: 'PUBLICATION_INCOMPLETE' } });
    expect(propertyWriteErrorMessage(error)).toBe('Para publicar necesitas al menos una habitación con precio y una foto.');
  });
});
