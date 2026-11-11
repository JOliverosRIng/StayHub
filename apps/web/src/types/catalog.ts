/**
 * Transport contracts consumed by the web client through the Gateway (`/api/v1`).
 *
 * - Property/Room/Photo/Feature/Location: `specs/002-alojamientos/contracts/openapi-accommodations-service.yaml`.
 * - Search*: `specs/002-alojamientos-busqueda/search_service/contracts/openapi-search-service.yaml`.
 * - Review*: provisional. No reviews-service OpenAPI exists yet (Sprint 3); align when it is published.
 *
 * Only shapes live here. Validation rules the UI mirrors are exported as constants so forms and
 * clients share a single source.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** ISO 8601 date-time string. */
export type IsoDateTime = string;
/** ISO 8601 calendar date (`YYYY-MM-DD`). */
export type IsoDate = string;

export interface FieldError { field: string; code: string }

/** RFC 9457 Problem Details as emitted by StayHub services. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  traceId?: string;
  errors?: FieldError[];
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

// ---------------------------------------------------------------------------
// Accommodations
// ---------------------------------------------------------------------------

export const PROPERTY_TYPES = ['HOTEL', 'APARTMENT', 'HOUSE', 'OTHER'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUSES = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PHOTO_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

/** Contract limits mirrored by forms. Photo size is decimal: 5 000 000 bytes, not 5 MiB. */
export const CATALOG_LIMITS = {
  nameMaxLength: 120,
  descriptionMaxLength: 5000,
  featureCodesMax: 50,
  addressLineMaxLength: 200,
  cityMaxLength: 100,
  regionMaxLength: 100,
  postalCodeMaxLength: 20,
  roomNameMaxLength: 120,
  photoMaxBytes: 5_000_000,
  photosPerProperty: 10,
} as const;

/** `BasePrice.amount`: positive decimal string with up to 10 integer and 2 fractional digits. */
export const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const ZERO_AMOUNT_PATTERN = /^0+(\.0{1,2})?$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export interface Location {
  addressLine: string;
  city: string;
  region: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface BasePrice {
  /** Decimal string, e.g. `"120.50"`. Never a float, to avoid rounding drift. */
  amount: string;
  /** ISO 4217. */
  currency: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  basePrice?: BasePrice | null;
}

export interface Feature { code: string; name: string }

export interface Photo {
  id: string;
  mediaType: PhotoMediaType;
  byteSize: number;
  position: number;
  createdAt: IsoDateTime;
  /**
   * Not in the accommodations contract: byte delivery is pending coordination with the Gateway (G1).
   * When present it is used as-is; otherwise `photoUrl()` derives the Gateway path.
   */
  url?: string;
}

export interface Property {
  id: string;
  /** Present only when the requester is the owner. */
  ownerId?: string;
  type: PropertyType;
  name: string;
  description?: string | null;
  location: Location;
  status: PropertyStatus;
  version: number;
  rooms: Room[];
  features: Feature[];
  photos: Photo[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RoomInput {
  name: string;
  capacity: number;
  basePrice?: BasePrice;
}

export interface RoomReplaceInput extends RoomInput {
  /** Existing room id updates it; omitted id creates a room; omitted room is deleted. */
  id?: string;
}

export interface PropertyCreate {
  type: PropertyType;
  name: string;
  description?: string;
  location: Location;
  featureCodes?: string[];
  rooms: RoomInput[];
}

export interface PropertyReplace {
  type: PropertyType;
  name: string;
  description?: string;
  location: Location;
  featureCodes?: string[];
  status: PropertyStatus;
  version: number;
  rooms: RoomReplaceInput[];
}

/**
 * Versioned v1 feature catalog of accommodations-service
 * (`apps/accommodations-service/prisma/migrations/202611040002_seed_feature_catalog`).
 * Unknown codes are rejected with 400, so the form only offers these.
 */
export const FEATURE_CATALOG: readonly Feature[] = [
  { code: 'WIFI', name: 'Wi-Fi' },
  { code: 'PARKING', name: 'Estacionamiento' },
  { code: 'POOL', name: 'Piscina' },
  { code: 'AIR_CONDITIONING', name: 'Aire acondicionado' },
  { code: 'KITCHEN', name: 'Cocina' },
  { code: 'PETS_ALLOWED', name: 'Admite mascotas' },
  { code: 'BREAKFAST_INCLUDED', name: 'Desayuno incluido' },
];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  HOTEL: 'Hotel', APARTMENT: 'Apartamento', HOUSE: 'Casa', OTHER: 'Otro',
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  accommodationId: string;
  name: string;
  location: string;
  minNightlyPrice: number;
  currency: string;
  capacity: number;
  /** Normalized (trimmed, lower-case) amenity terms. */
  amenities: string[];
  primaryPhotoUrl?: string | null;
  relevance: number;
}

export interface SearchResponse extends Page<SearchResult> {
  /** `PROJECTED` snapshot for [checkIn, checkOut); never an authoritative availability. */
  availabilityKind?: 'PROJECTED' | null;
}

/** Query filters for `GET /search`. All filters combine with AND. */
export interface SearchFilters {
  q?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Required by the contract whenever minPrice or maxPrice is sent. */
  currency?: string;
  checkIn?: IsoDate;
  checkOut?: IsoDate;
  guests?: number;
  amenities?: string[];
  page?: number;
  pageSize?: number;
}

export const SEARCH_LIMITS = {
  qMaxLength: 200,
  locationMaxLength: 120,
  amenitiesMax: 20,
  amenityMaxLength: 60,
  pageSizeMax: 100,
  defaultPageSize: 20,
  suggestQueryMaxLength: 120,
  suggestLimitMax: 20,
} as const;

export interface SearchSuggestion { text: string; type: 'PROPERTY' | 'LOCATION' }
export interface SearchSuggestResponse { items: SearchSuggestion[] }

// ---------------------------------------------------------------------------
// Reviews (provisional, see header)
// ---------------------------------------------------------------------------

export interface Review {
  id: string;
  propertyId: string;
  authorId: string;
  /** Display name resolved by the backend; the client never looks up other users. */
  authorName?: string;
  /** Integer 1–5 (RQ-11). */
  rating: number;
  comment: string;
  createdAt: IsoDateTime;
}

export interface ReviewPage extends Page<Review> {
  /** Average of all ratings, or null when there are no reviews. */
  averageRating: number | null;
}

// ---------------------------------------------------------------------------
// Bookings (RQ-07) — aligned to
// `specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-bookings-service.yaml`.
// External dependency: the Gateway does not expose `/bookings` yet; the web client develops against
// the MSW contract mock until then.
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = [
  'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED_BY_GUEST', 'CANCELLED_BY_OWNER',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'NOT_STARTED', 'ORDER_PENDING', 'PENDING', 'CAPTURED', 'FAILED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Request body of `POST /bookings`. `checkIn` is inclusive, `checkOut` exclusive. */
export interface CreateBookingInput {
  propertyId: string;
  roomId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guests: number;
}

export interface Booking {
  id: string;
  guestId: string;
  /** Present only when the requester is the property owner. */
  ownerId?: string;
  propertyId: string;
  roomId: string;
  propertyName: string;
  roomName: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guests: number;
  nights: number;
  nightlyPrice: BasePrice;
  total: BasePrice;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentOrderId?: string | null;
  holdExpiresAt?: string | null;
  cancellationReason?: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
