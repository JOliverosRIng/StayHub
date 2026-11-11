import { http, HttpResponse, type PathParams } from 'msw';
import type { Problem, Property, PropertyCreate, PropertyReplace, Review, RoomReplaceInput } from '../../src/types/catalog';
import {
  CATALOG_LIMITS, FEATURE_CATALOG, PHOTO_MEDIA_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES,
} from '../../src/types/catalog';
import { buildProperties, buildReviews, toSearchResult } from './fixtures';

/**
 * Contract mocks for the Gateway routes that are not exposed yet (properties, search, reviews).
 * Behaviour follows the OpenAPI drafts closely enough to exercise success, validation, auth and
 * conflict paths. Identity routes are intentionally absent so they reach the real Gateway in dev.
 */

const API = '*/api/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const db = { properties: buildProperties(), reviews: buildReviews() };

/** Restores fixtures; called after every test so mutations never leak. */
export function resetMockDb(): void {
  db.properties = buildProperties();
  db.reviews = buildReviews();
}

export const mockDb = {
  property: (id: string) => db.properties.find((p) => p.id === id),
  properties: () => db.properties,
  addReview: (review: Review) => { db.reviews.push(review); },
};

// ---------------------------------------------------------------------------
// Auth: mock bearer = unsigned JWT whose payload carries `sub` and `role`
// ---------------------------------------------------------------------------

type Role = 'GUEST' | 'OWNER' | 'ADMIN';
interface Caller { sub: string; role: Role }

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Builds a bearer the mock accepts. Real Gateway tokens are also decoded (signature is not checked). */
export function mockToken(role: Role, sub: string): string {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub, role })}.mock`;
}

type AuthResult = { caller?: Caller; invalid?: boolean };

function authenticate(request: Request): AuthResult {
  const header = request.headers.get('Authorization');
  if (!header) return {};
  const token = /^Bearer (.+)$/.exec(header)?.[1];
  const payload = token?.split('.')[1];
  if (!payload) return { invalid: true };
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Partial<Caller>;
    if (typeof claims.sub !== 'string' || !['GUEST', 'OWNER', 'ADMIN'].includes(claims.role as string)) return { invalid: true };
    return { caller: { sub: claims.sub, role: claims.role as Role } };
  } catch { return { invalid: true }; }
}

// ---------------------------------------------------------------------------
// Problem Details
// ---------------------------------------------------------------------------

let traceCounter = 0;
export function problem(status: number, code: string, errors: Problem['errors'] = []) {
  traceCounter += 1;
  const body: Problem = {
    type: 'about:blank', title: code, status, detail: code, instance: '/api/v1', code,
    traceId: `mock-trace-${traceCounter}`, errors,
  };
  return HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } });
}

const invalid = (...fields: string[]) => problem(400, 'VALIDATION_ERROR', fields.map((field) => ({ field, code: 'INVALID_VALUE' })));

// ---------------------------------------------------------------------------
// Validation mirroring the accommodations contract
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const knownFeature = (code: string) => FEATURE_CATALOG.some((f) => f.code === code);

function validateBody(body: unknown, replace: boolean): string[] {
  if (!isObject(body)) return ['body'];
  const allowed = replace
    ? ['type', 'name', 'description', 'location', 'featureCodes', 'status', 'version', 'rooms']
    : ['type', 'name', 'description', 'location', 'featureCodes', 'rooms'];
  const errors = Object.keys(body).filter((k) => !allowed.includes(k));
  if (!PROPERTY_TYPES.includes(body.type as never)) errors.push('type');
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > CATALOG_LIMITS.nameMaxLength) errors.push('name');
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > CATALOG_LIMITS.descriptionMaxLength)) errors.push('description');
  const loc = body.location;
  if (!isObject(loc)) errors.push('location');
  else {
    for (const key of ['addressLine', 'city', 'region'] as const) if (typeof loc[key] !== 'string' || !(loc[key] as string).trim()) errors.push(`location.${key}`);
    if (typeof loc.country !== 'string' || !/^[A-Z]{2}$/.test(loc.country)) errors.push('location.country');
  }
  if (body.featureCodes !== undefined) {
    const codes = body.featureCodes;
    if (!Array.isArray(codes) || new Set(codes).size !== codes.length || codes.some((c) => typeof c !== 'string' || !knownFeature(c))) errors.push('featureCodes');
  }
  if (!Array.isArray(body.rooms) || body.rooms.length === 0) errors.push('rooms');
  else body.rooms.forEach((r: unknown, i) => {
    if (!isObject(r) || typeof r.name !== 'string' || !r.name.trim() || !Number.isInteger(r.capacity) || (r.capacity as number) < 1) errors.push(`rooms[${i}]`);
    else if (r.basePrice !== undefined && (!isObject(r.basePrice) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(r.basePrice.amount)) || /^0+(\.0{1,2})?$/.test(String(r.basePrice.amount)) || !/^[A-Z]{3}$/.test(String(r.basePrice.currency)))) errors.push(`rooms[${i}].basePrice`);
  });
  if (replace) {
    if (!PROPERTY_STATUSES.includes(body.status as never)) errors.push('status');
    if (!Number.isInteger(body.version) || (body.version as number) < 1) errors.push('version');
  }
  return errors;
}

const publishable = (p: Property) => p.rooms.some((r) => r.basePrice) && p.photos.length > 0;
const transitions: Array<[string, string]> = [['DRAFT', 'PUBLISHED'], ['PUBLISHED', 'UNPUBLISHED'], ['UNPUBLISHED', 'PUBLISHED']];

function view(property: Property, caller?: Caller): Property {
  if (caller?.sub === property.ownerId) return property;
  const { ownerId: _omitted, ...rest } = property;
  void _omitted;
  return rest;
}

function visible(property: Property | undefined, caller?: Caller): property is Property {
  return !!property && (property.status === 'PUBLISHED' || caller?.sub === property.ownerId);
}

const features = (codes: string[] = []) => codes.map((code) => FEATURE_CATALOG.find((f) => f.code === code)!);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function relevance(property: Property, q: string): number {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  const name = fold(property.name);
  const place = fold(`${property.location.city} ${property.location.region} ${property.location.country}`);
  const text = fold(property.description ?? '');
  return terms.reduce((score, t) => score + (name.includes(t) ? 1 : 0) + (place.includes(t) ? 0.4 : 0) + (text.includes(t) ? 0.1 : 0), 0);
}

function int(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  return /^\d+$/.test(value) ? Number(value) : null;
}

const searchHandler = http.get(`${API}/search`, ({ request }) => {
  const params = new URL(request.url).searchParams;
  const q = params.get('q')?.trim() || undefined;
  const location = params.get('location')?.trim() || undefined;
  const currency = params.get('currency') ?? undefined;
  const minPrice = params.has('minPrice') ? Number(params.get('minPrice')) : undefined;
  const maxPrice = params.has('maxPrice') ? Number(params.get('maxPrice')) : undefined;
  const checkIn = params.get('checkIn') ?? undefined;
  const checkOut = params.get('checkOut') ?? undefined;
  const guests = int(params.get('guests'));
  const page = int(params.get('page')) ?? 1;
  const pageSize = int(params.get('pageSize')) ?? 20;
  const amenities = params.getAll('amenities').map((a) => a.trim().toLowerCase());

  const errors: string[] = [];
  if (q && q.length > 200) errors.push('q');
  if ((minPrice !== undefined || maxPrice !== undefined) && !/^[A-Z]{3}$/.test(currency ?? '')) errors.push('currency');
  if (minPrice !== undefined && (Number.isNaN(minPrice) || minPrice < 0)) errors.push('minPrice');
  if (maxPrice !== undefined && (Number.isNaN(maxPrice) || maxPrice < 0)) errors.push('maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) errors.push('minPrice');
  if ((checkIn === undefined) !== (checkOut === undefined) || (checkIn && checkOut && checkOut <= checkIn)) errors.push('checkOut');
  if (guests === null || (guests !== undefined && guests < 1)) errors.push('guests');
  if (page === null || page < 1) errors.push('page');
  if (pageSize === null || pageSize < 1 || pageSize > 100) errors.push('pageSize');
  if (amenities.length > 20) errors.push('amenities');
  if (errors.length) return invalid(...errors);

  const results = db.properties
    .filter((p) => p.status === 'PUBLISHED')
    .map((p) => toSearchResult(p, q ? relevance(p, q) : 0))
    .filter((r) => !q || r.relevance > 0)
    .filter((r) => !location || fold(r.location).includes(fold(location)))
    .filter((r) => minPrice === undefined || (r.currency === currency && r.minNightlyPrice >= minPrice))
    .filter((r) => maxPrice === undefined || (r.currency === currency && r.minNightlyPrice <= maxPrice))
    .filter((r) => guests === undefined || r.capacity >= (guests as number))
    .filter((r) => amenities.every((a) => r.amenities.includes(a)))
    .sort((a, b) => b.relevance - a.relevance || a.accommodationId.localeCompare(b.accommodationId));

  const start = ((page as number) - 1) * (pageSize as number);
  return HttpResponse.json({
    items: results.slice(start, start + (pageSize as number)),
    page, pageSize, total: results.length, hasNext: start + (pageSize as number) < results.length,
    availabilityKind: checkIn ? 'PROJECTED' : null,
  });
});

const suggestHandler = http.get(`${API}/search/suggest`, ({ request }) => {
  const params = new URL(request.url).searchParams;
  const q = params.get('q')?.trim() ?? '';
  const limit = int(params.get('limit')) ?? 10;
  if (!q || q.length > 120) return invalid('q');
  if (limit === null || limit < 1 || limit > 20) return invalid('limit');
  const term = fold(q);
  const published = db.properties.filter((p) => p.status === 'PUBLISHED');
  const names = published.filter((p) => fold(p.name).includes(term)).map((p) => ({ text: p.name, type: 'PROPERTY' as const }));
  const places = [...new Set(published.map((p) => p.location.city))].filter((c) => fold(c).includes(term)).map((text) => ({ text, type: 'LOCATION' as const }));
  return HttpResponse.json({ items: [...places, ...names].slice(0, limit) });
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

type IdParams = PathParams<'id'>;

/**
 * PROVISIONAL owner-scoped listing (`GET /properties?mine=true`). The accommodations contract has no
 * owner listing yet (External dependency: G1); this mock lets FE-023 develop against the shape the
 * real endpoint is expected to take. Returns every property owned by the caller, all statuses.
 */
const myPropertiesHandler = http.get(`${API}/properties`, ({ request }) => {
  const auth = authenticate(request);
  if (!auth.caller) return problem(401, 'HTTP_401');
  const caller = auth.caller;
  if (caller.role !== 'OWNER') return problem(403, 'FORBIDDEN');
  const mine = db.properties.filter((p) => p.ownerId === caller.sub).sort((a, b) => a.name.localeCompare(b.name));
  return HttpResponse.json(mine);
});

const getPropertyHandler = http.get<IdParams>(`${API}/properties/:id`, ({ request, params }) => {
  const id = String(params.id);
  if (!UUID.test(id)) return invalid('id');
  const auth = authenticate(request);
  if (auth.invalid) return problem(401, 'HTTP_401');
  const property = mockDb.property(id);
  if (!visible(property, auth.caller)) return problem(404, 'NOT_FOUND');
  return HttpResponse.json(view(property, auth.caller));
});

const reviewsHandler = http.get<IdParams>(`${API}/properties/:id/reviews`, ({ request, params }) => {
  const id = String(params.id);
  if (!UUID.test(id)) return invalid('id');
  const auth = authenticate(request);
  if (auth.invalid) return problem(401, 'HTTP_401');
  if (!visible(mockDb.property(id), auth.caller)) return problem(404, 'NOT_FOUND');
  const search = new URL(request.url).searchParams;
  const page = int(search.get('page')) ?? 1;
  const pageSize = int(search.get('pageSize')) ?? 10;
  if (page === null || page < 1 || pageSize === null || pageSize < 1 || pageSize > 50) return invalid('page');
  const all = db.reviews.filter((r) => r.propertyId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = (page - 1) * pageSize;
  const averageRating = all.length ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 100) / 100 : null;
  return HttpResponse.json({ items: all.slice(start, start + pageSize), page, pageSize, total: all.length, hasNext: start + pageSize < all.length, averageRating });
});

const createPropertyHandler = http.post(`${API}/properties`, async ({ request }) => {
  const auth = authenticate(request);
  if (!auth.caller) return problem(401, 'HTTP_401');
  if (auth.caller.role !== 'OWNER') return problem(403, 'FORBIDDEN');
  const body = await request.json().catch(() => undefined) as PropertyCreate | undefined;
  const errors = validateBody(body, false);
  if (errors.length || !body) return invalid(...errors);
  const now = new Date().toISOString();
  const property: Property = {
    id: crypto.randomUUID(), ownerId: auth.caller.sub, type: body.type, name: body.name.trim(),
    description: body.description ?? null, location: body.location, status: 'DRAFT', version: 1,
    rooms: body.rooms.map((r) => ({ id: crypto.randomUUID(), name: r.name, capacity: r.capacity, basePrice: r.basePrice ?? null })),
    features: features(body.featureCodes), photos: [], createdAt: now, updatedAt: now,
  };
  db.properties.push(property);
  return HttpResponse.json(property, { status: 201 });
});

const replacePropertyHandler = http.put<IdParams>(`${API}/properties/:id`, async ({ request, params }) => {
  const id = String(params.id);
  if (!UUID.test(id)) return invalid('id');
  const auth = authenticate(request);
  if (!auth.caller) return problem(401, 'HTTP_401');
  if (auth.caller.role !== 'OWNER') return problem(403, 'FORBIDDEN');
  const current = mockDb.property(id);
  if (!current || current.ownerId !== auth.caller.sub) return problem(404, 'NOT_FOUND');
  const body = await request.json().catch(() => undefined) as PropertyReplace | undefined;
  const errors = validateBody(body, true);
  if (errors.length || !body) return invalid(...errors);
  if (body.version !== current.version) return problem(409, 'VERSION_CONFLICT');
  const unknownRoom = body.rooms.findIndex((r: RoomReplaceInput) => r.id && !current.rooms.some((c) => c.id === r.id));
  if (unknownRoom >= 0) return invalid(`rooms[${unknownRoom}].id`);
  if (current.status !== body.status && !transitions.some(([a, b]) => a === current.status && b === body.status)) return problem(409, 'STATE_CONFLICT');
  const next: Property = {
    ...current, type: body.type, name: body.name.trim(), description: body.description ?? null, location: body.location,
    features: features(body.featureCodes), status: body.status, version: current.version + 1, updatedAt: new Date().toISOString(),
    rooms: body.rooms.map((r) => ({ id: r.id ?? crypto.randomUUID(), name: r.name, capacity: r.capacity, basePrice: r.basePrice ?? null })),
  };
  if (body.status === 'PUBLISHED' && !publishable(next)) return problem(409, 'PUBLICATION_INCOMPLETE');
  db.properties = db.properties.map((p) => (p.id === id ? next : p));
  return HttpResponse.json(next);
});

const uploadPhotoHandler = http.post<IdParams>(`${API}/properties/:id/photos`, async ({ request, params }) => {
  const id = String(params.id);
  if (!UUID.test(id)) return invalid('id');
  const auth = authenticate(request);
  if (!auth.caller) return problem(401, 'HTTP_401');
  if (auth.caller.role !== 'OWNER') return problem(403, 'FORBIDDEN');
  const property = mockDb.property(id);
  if (!property || property.ownerId !== auth.caller.sub) return problem(404, 'NOT_FOUND');
  const form = await request.formData().catch(() => undefined);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return invalid('file');
  if (file.size < 1) return invalid('file');
  if (file.size > CATALOG_LIMITS.photoMaxBytes) return problem(413, 'PHOTO_TOO_LARGE');
  if (!PHOTO_MEDIA_TYPES.includes(file.type as never)) return problem(415, 'PHOTO_MEDIA_TYPE');
  if (property.photos.length >= CATALOG_LIMITS.photosPerProperty) return problem(409, 'PHOTO_LIMIT_REACHED');
  const photo = {
    id: crypto.randomUUID(), mediaType: file.type as Property['photos'][number]['mediaType'], byteSize: file.size,
    position: property.photos.length, createdAt: new Date().toISOString(),
  };
  // In the browser dev mock the stored copy gets a local URL so the gallery can render it.
  const stored = typeof URL.createObjectURL === 'function' ? { ...photo, url: URL.createObjectURL(file) } : photo;
  property.photos.push(stored);
  return HttpResponse.json(photo, { status: 201 });
});

export const handlers = [
  suggestHandler,
  searchHandler,
  reviewsHandler,
  uploadPhotoHandler,
  myPropertiesHandler,
  getPropertyHandler,
  createPropertyHandler,
  replacePropertyHandler,
];
