import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, API_BASE_URL } from './http';
import { ApiError } from './identity';
import { searchKeys } from './search';
import {
  CATALOG_LIMITS, PHOTO_MEDIA_TYPES,
  type BasePrice, type Location, type Photo, type Property, type PropertyCreate, type PropertyReplace,
} from '../types/catalog';

/**
 * Accommodations client through the Gateway (External dependency: G1 must expose `/properties`).
 * Reads are public for PUBLISHED properties; the session bearer is attached when present so owners
 * can also see their drafts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPropertyId = (id: string | undefined): id is string => !!id && UUID.test(id);

export const propertyKeys = {
  all: ['properties'] as const,
  detail: (id: string) => [...propertyKeys.all, 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getProperty(id: string, signal?: AbortSignal): Promise<Property> {
  // The contract answers 400 for a non-UUID id; for a visitor that is simply "not found".
  if (!isPropertyId(id)) throw new ApiError(404, { code: 'NOT_FOUND' });
  const { data } = await http.get<Property>(`/properties/${id}`, { signal });
  return data;
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: propertyKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getProperty(id ?? '', signal),
    enabled: id !== undefined,
  });
}

export function propertyErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'No encontramos este alojamiento. Puede que ya no esté publicado.';
  if (error instanceof ApiError && error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
  return 'No pudimos cargar el alojamiento. Intenta nuevamente.';
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export function sortedPhotos(property: Pick<Property, 'photos'>): Photo[] {
  return [...property.photos].sort((a, b) => a.position - b.position);
}

/** Photo bytes delivery is pending G1; until then the Gateway path is derived from the metadata. */
export function photoUrl(propertyId: string, photo: Pick<Photo, 'id' | 'url'>): string {
  return photo.url ?? `${API_BASE_URL}/properties/${propertyId}/photos/${photo.id}`;
}

export function lowestNightlyPrice(property: Pick<Property, 'rooms'>): BasePrice | undefined {
  return property.rooms
    .map((room) => room.basePrice)
    .filter((price): price is BasePrice => !!price)
    .sort((a, b) => Number(a.amount) - Number(b.amount))[0];
}

export function formatMoney(amount: string | number, currency: string): string {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatLocation(location: Pick<Location, 'city' | 'region' | 'country'>): string {
  return [location.city, location.region, location.country].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------
// Write (RQ-05)
// ---------------------------------------------------------------------------

export async function createProperty(input: PropertyCreate): Promise<Property> {
  const { data } = await http.post<Property>('/properties', input);
  return data;
}

export async function replaceProperty(id: string, input: PropertyReplace): Promise<Property> {
  const { data } = await http.put<Property>(`/properties/${id}`, input);
  return data;
}

/** Full PUT representation of `property` (omitted fields are cleared by the contract). */
export function toReplaceInput(property: Property, overrides: Partial<PropertyReplace> = {}): PropertyReplace {
  return {
    type: property.type,
    name: property.name,
    ...(property.description ? { description: property.description } : {}),
    location: property.location,
    featureCodes: property.features.map((f) => f.code),
    status: property.status,
    version: property.version,
    rooms: property.rooms.map((room) => ({
      id: room.id, name: room.name, capacity: room.capacity, ...(room.basePrice ? { basePrice: room.basePrice } : {}),
    })),
    ...overrides,
  };
}

/** DRAFT/UNPUBLISHED → PUBLISHED. Requires a priced room and at least one photo. */
export function publishProperty(property: Property): Promise<Property> {
  return replaceProperty(property.id, toReplaceInput(property, { status: 'PUBLISHED' }));
}

/**
 * RQ-03 edit: persists the editable fields of an owned property. Builds the full PUT representation
 * from the current property plus `changes` (so the server never clears a field the owner left
 * untouched) and carries the current `version` for optimistic concurrency. Transport failures surface
 * as `ApiError` (400/401/403/404/409) exactly like the rest of the write client.
 */
export function saveProperty(property: Property, changes: Partial<PropertyReplace> = {}): Promise<Property> {
  return replaceProperty(property.id, toReplaceInput(property, changes));
}

/** Client-side guard mirroring the contract. The server still decides by magic bytes. */
export function validatePhotoFile(file: Pick<File, 'size' | 'type'>): string | undefined {
  if (file.size < 1) return 'El archivo está vacío.';
  if (!PHOTO_MEDIA_TYPES.includes(file.type as never)) return PHOTO_MESSAGES.mediaType;
  if (file.size > CATALOG_LIMITS.photoMaxBytes) return PHOTO_MESSAGES.tooLarge;
  return undefined;
}

const PHOTO_MESSAGES = {
  tooLarge: 'La foto supera 5 MB (5 000 000 bytes).',
  mediaType: 'Solo se aceptan fotos JPEG, PNG o WebP.',
};

class PhotoFileError extends ApiError {
  constructor(public readonly reason: string) {
    super(400, { code: 'PHOTO_FILE_INVALID' });
  }
}

export async function uploadPropertyPhoto(propertyId: string, file: File, signal?: AbortSignal): Promise<Photo> {
  const invalid = validatePhotoFile(file);
  if (invalid) throw new PhotoFileError(invalid);
  const body = new FormData();
  body.append('file', file, file.name);
  // Content-Type (with boundary) is set by the browser for FormData.
  const { data } = await http.post<Photo>(`/properties/${propertyId}/photos`, body, { signal });
  return data;
}

export function fieldErrors(error: unknown): string[] {
  return error instanceof ApiError ? (error.problem?.errors ?? []).map((e) => e.field) : [];
}

/** Safe copy for write failures, keyed by contract `code` first and HTTP status second. */
export function propertyWriteErrorMessage(error: unknown): string {
  if (error instanceof PhotoFileError) return error.reason;
  if (!(error instanceof ApiError)) return 'No pudimos guardar la propiedad. Intenta nuevamente.';
  switch (error.problem?.code) {
    case 'VALIDATION_ERROR': return 'Revisa los datos marcados en el formulario.';
    case 'VERSION_CONFLICT': return 'La propiedad cambió mientras la editabas. Recarga para ver la última versión.';
    case 'PUBLICATION_INCOMPLETE': return 'Para publicar necesitas al menos una habitación con precio y una foto.';
    case 'STATE_CONFLICT': return 'Ese cambio de estado no está permitido.';
    case 'PHOTO_LIMIT_REACHED': return `Alcanzaste el máximo de ${CATALOG_LIMITS.photosPerProperty} fotos por propiedad.`;
    case 'PHOTO_TOO_LARGE': return PHOTO_MESSAGES.tooLarge;
    case 'PHOTO_MEDIA_TYPE': return PHOTO_MESSAGES.mediaType;
    default: break;
  }
  switch (error.status) {
    case 400: return 'Revisa los datos marcados en el formulario.';
    case 401: return 'Tu sesión venció. Inicia sesión nuevamente.';
    case 403: return 'Solo los propietarios pueden publicar alojamientos.';
    case 404: return 'No encontramos la propiedad o no te pertenece.';
    case 413: return PHOTO_MESSAGES.tooLarge;
    case 415: return PHOTO_MESSAGES.mediaType;
    default: return error.message;
  }
}

export function useCreateProperty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createProperty,
    onSuccess: (property) => client.setQueryData(propertyKeys.detail(property.id), property),
  });
}

export function useUploadPropertyPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, file }: { propertyId: string; file: File }) => uploadPropertyPhoto(propertyId, file),
    onSuccess: (_photo, { propertyId }) => client.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) }),
  });
}

export function usePublishProperty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: publishProperty,
    onSuccess: (property) => {
      client.setQueryData(propertyKeys.detail(property.id), property);
      void client.invalidateQueries({ queryKey: searchKeys.all });
    },
  });
}

/** RQ-03 edit mutation. On success refreshes the cached detail and search so both reflect the edit. */
export function useUpdateProperty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ property, changes }: { property: Property; changes?: Partial<PropertyReplace> }) => saveProperty(property, changes),
    onSuccess: (property) => {
      client.setQueryData(propertyKeys.detail(property.id), property);
      void client.invalidateQueries({ queryKey: searchKeys.all });
    },
  });
}
