import type { Booking, Property, Review, SearchResult } from '../../src/types/catalog';

/**
 * Contract-shaped fixtures for MSW. IDs are stable UUIDs so tests and the dev mock can deep-link.
 * Photo `url` is a dev convenience (byte delivery through the Gateway is pending G1).
 */
export const OWNER_ID = '7d1f4c1e-2b7a-4c3e-9a51-0c4b6f1e2a01';
export const OTHER_OWNER_ID = '7d1f4c1e-2b7a-4c3e-9a51-0c4b6f1e2a02';
export const GUEST_ID = '7d1f4c1e-2b7a-4c3e-9a51-0c4b6f1e2a03';
export const OTHER_GUEST_ID = '7d1f4c1e-2b7a-4c3e-9a51-0c4b6f1e2a04';

export const BOOKING_IDS = {
  /** Confirmed stay by GUEST_ID at Casa Azul (room 1) over [2026-12-10, 2026-12-14); blocks those nights. */
  casaAzulConfirmed: '6e2c9a84-5b7d-4c6e-9a1f-00000000b001',
  /** Completed stay by GUEST_ID at Villa Serena (room 1); oldest in the owner history. */
  villaCompleted: '6e2c9a84-5b7d-4c6e-9a1f-00000000b002',
  /** Guest-cancelled stay by OTHER_GUEST_ID at Cabaña del Bosque; newest in the owner history. */
  cabanaCancelled: '6e2c9a84-5b7d-4c6e-9a1f-00000000b003',
} as const;

export const PROPERTY_IDS = {
  villa: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e01',
  casaAzul: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e02',
  hacienda: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e03',
  loft: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e04',
  cabana: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e05',
  hotelCentro: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e06',
  draft: '1b0d6a52-0f5c-4c55-9a0e-1a2b3c4d5e07',
} as const;

const created = '2026-10-01T12:00:00.000Z';
const img = (id: string) => `https://images.unsplash.com/${id}?w=800&h=500&fit=crop&auto=format`;

function photo(propertyIndex: number, position: number, imageId: string) {
  return {
    id: `2c0e7b63-1a6d-4d66-8b1f-${String(propertyIndex).padStart(4, '0')}${String(position).padStart(8, '0')}`,
    mediaType: 'image/jpeg' as const, byteSize: 245_000, position, createdAt: created, url: img(imageId),
  };
}

function room(propertyIndex: number, index: number, name: string, capacity: number, amount: string, currency = 'USD') {
  return {
    id: `3d1f8c74-2b7e-4e77-9c2a-${String(propertyIndex).padStart(4, '0')}${String(index).padStart(8, '0')}`,
    name, capacity, basePrice: { amount, currency },
  };
}

const feature = (code: string, name: string) => ({ code, name });

export function buildProperties(): Property[] {
  return [
    {
      id: PROPERTY_IDS.villa, ownerId: OWNER_ID, type: 'HOTEL', name: 'Villa Serena Boutique Hotel & Spa',
      description: 'Refugio exclusivo con piscina infinity frente al Mediterráneo, spa completo y desayunos de autor.',
      location: { addressLine: 'Carrer de la Mar 12', city: 'Palma de Mallorca', region: 'Islas Baleares', country: 'ES', postalCode: '07001', latitude: 39.5696, longitude: 2.6502 },
      status: 'PUBLISHED', version: 3,
      rooms: [room(1, 1, 'Suite Mediterránea', 2, '195.00', 'EUR'), room(1, 2, 'Suite Familiar', 4, '260.00', 'EUR')],
      features: [feature('WIFI', 'Wi-Fi'), feature('POOL', 'Pool'), feature('AIR_CONDITIONING', 'Air conditioning'), feature('BREAKFAST_INCLUDED', 'Breakfast included')],
      photos: [photo(1, 0, 'photo-1566073771259-6a8506099945'), photo(1, 1, 'photo-1582719478250-c89cae4dc85b'), photo(1, 2, 'photo-1571896349842-33c89424de2d'), photo(1, 3, 'photo-1520250497591-112f2f40a3f4')],
      createdAt: created, updatedAt: created,
    },
    {
      id: PROPERTY_IDS.casaAzul, ownerId: OWNER_ID, type: 'HOUSE', name: 'Casa Azul Frente al Mar',
      description: 'Paraíso tropical a pasos de la playa de Tulum, rodeado de selva y con acceso directo al Caribe.',
      location: { addressLine: 'Carretera Tulum-Boca Paila km 7', city: 'Tulum', region: 'Quintana Roo', country: 'MX', latitude: 20.2114, longitude: -87.4654 },
      status: 'PUBLISHED', version: 1,
      rooms: [room(2, 1, 'Casa completa', 6, '145.00')],
      features: [feature('WIFI', 'Wi-Fi'), feature('KITCHEN', 'Kitchen'), feature('PETS_ALLOWED', 'Pets allowed'), feature('POOL', 'Pool')],
      photos: [photo(2, 0, 'photo-1564013799919-ab600027ffc6'), photo(2, 1, 'photo-1540541338537-1220059af4dc')],
      createdAt: created, updatedAt: created,
    },
    {
      id: PROPERTY_IDS.hacienda, ownerId: OTHER_OWNER_ID, type: 'HOTEL', name: 'Hacienda Las Flores',
      description: 'Hacienda colonial con jardines, cocina oaxaqueña y talleres de mezcal en el centro histórico.',
      location: { addressLine: 'Calle Macedonio Alcalá 400', city: 'Oaxaca', region: 'Oaxaca', country: 'MX', latitude: 17.0654, longitude: -96.7236 },
      status: 'PUBLISHED', version: 2,
      rooms: [room(3, 1, 'Habitación Jardín', 2, '98.00'), room(3, 2, 'Suite Colonial', 3, '130.00')],
      features: [feature('WIFI', 'Wi-Fi'), feature('BREAKFAST_INCLUDED', 'Breakfast included'), feature('PARKING', 'Parking')],
      photos: [photo(3, 0, 'photo-1568084680786-a84f91d1153c')],
      createdAt: created, updatedAt: created,
    },
    {
      id: PROPERTY_IDS.loft, ownerId: OTHER_OWNER_ID, type: 'APARTMENT', name: 'Loft Industrial Condesa',
      description: 'Loft luminoso en la colonia Condesa, cerca de parques, cafés y vida nocturna.',
      location: { addressLine: 'Av. Ámsterdam 210', city: 'Ciudad de México', region: 'CDMX', country: 'MX' },
      status: 'PUBLISHED', version: 1,
      rooms: [room(4, 1, 'Loft', 2, '75.00')],
      features: [feature('WIFI', 'Wi-Fi'), feature('KITCHEN', 'Kitchen'), feature('AIR_CONDITIONING', 'Air conditioning')],
      photos: [photo(4, 0, 'photo-1606402179428-a57976d71fa4')],
      createdAt: created, updatedAt: created,
    },
    {
      id: PROPERTY_IDS.cabana, ownerId: OWNER_ID, type: 'HOUSE', name: 'Cabaña del Bosque Nevado',
      description: 'Cabaña de madera junto al lago con chimenea, ideal para escapadas de montaña.',
      location: { addressLine: 'Ruta 77 km 12', city: 'Bariloche', region: 'Río Negro', country: 'AR', latitude: -41.1335, longitude: -71.3103 },
      status: 'PUBLISHED', version: 1,
      rooms: [room(5, 1, 'Cabaña', 5, '120.00')],
      features: [feature('PARKING', 'Parking'), feature('PETS_ALLOWED', 'Pets allowed'), feature('KITCHEN', 'Kitchen')],
      photos: [photo(5, 0, 'photo-1506059612708-99d6c258160e')],
      createdAt: created, updatedAt: created,
    },
    {
      id: PROPERTY_IDS.hotelCentro, ownerId: OTHER_OWNER_ID, type: 'HOTEL', name: 'Hotel Centro Histórico Cartagena',
      description: 'Hotel boutique amurallado con terraza y piscina en la azotea, a pasos de la plaza principal.',
      location: { addressLine: 'Calle del Curato 38-12', city: 'Cartagena', region: 'Bolívar', country: 'CO', latitude: 10.4236, longitude: -75.5503 },
      status: 'PUBLISHED', version: 4,
      rooms: [room(6, 1, 'Doble Estándar', 2, '88.00'), room(6, 2, 'Suite Terraza', 4, '210.00')],
      features: [feature('WIFI', 'Wi-Fi'), feature('POOL', 'Pool'), feature('AIR_CONDITIONING', 'Air conditioning')],
      photos: [photo(6, 0, 'photo-1615460549969-36fa19521a4f'), photo(6, 1, 'photo-1561501900-3701fa6a0864')],
      createdAt: created, updatedAt: created,
    },
    {
      id: PROPERTY_IDS.draft, ownerId: OWNER_ID, type: 'APARTMENT', name: 'Apartamento en preparación',
      description: null,
      location: { addressLine: 'Calle 10 #5-20', city: 'Medellín', region: 'Antioquia', country: 'CO' },
      status: 'DRAFT', version: 1,
      rooms: [{ id: '3d1f8c74-2b7e-4e77-9c2a-000700000001', name: 'Principal', capacity: 2, basePrice: null }],
      features: [], photos: [], createdAt: created, updatedAt: created,
    },
  ];
}

export function buildReviews(): Review[] {
  const review = (n: number, propertyId: string, rating: number, comment: string, authorName: string): Review => ({
    id: `4e2a9d85-3c8f-4f88-8d3b-${String(n).padStart(12, '0')}`, propertyId, authorId: GUEST_ID, authorName,
    rating, comment, createdAt: `2026-09-${String(10 + n).padStart(2, '0')}T10:00:00.000Z`,
  });
  return [
    review(1, PROPERTY_IDS.villa, 5, 'Vistas increíbles y un servicio impecable.', 'Lucía'),
    review(2, PROPERTY_IDS.villa, 4, 'Muy cómodo; el desayuno podría tener más variedad.', 'Andrés'),
    review(3, PROPERTY_IDS.villa, 5, 'Volveremos sin duda.', 'Marta'),
    review(4, PROPERTY_IDS.casaAzul, 5, 'La playa está literalmente al cruzar la puerta.', 'Sofía'),
    review(5, PROPERTY_IDS.hacienda, 4, 'Ubicación perfecta para recorrer Oaxaca.', 'Diego'),
  ];
}

/** Search projection derived from published fixtures, as the search consumer would index it. */
export function toSearchResult(property: Property, relevance = 0): SearchResult {
  const priced = property.rooms.filter((r) => r.basePrice);
  const min = priced.reduce((best, r) => Math.min(best, Number(r.basePrice!.amount)), Number.POSITIVE_INFINITY);
  return {
    accommodationId: property.id,
    name: property.name,
    location: [property.location.city, property.location.region, property.location.country].join(', '),
    minNightlyPrice: Number.isFinite(min) ? min : 0,
    currency: priced[0]?.basePrice?.currency ?? 'USD',
    capacity: property.rooms.reduce((max, r) => Math.max(max, r.capacity), 1),
    amenities: property.features.map((f) => f.code.toLowerCase()),
    primaryPhotoUrl: property.photos[0]?.url ?? null,
    relevance,
  };
}

/**
 * Booking fixtures for the Bookings contract mock (External dependency: Gateway `/bookings` pending).
 * One CONFIRMED stay by GUEST_ID blocks Casa Azul's first room for its nights, to exercise overlap
 * (409) and ownership (own vs. other guest) paths.
 */
export function buildBookings(): Booking[] {
  const props = buildProperties();
  const prop = (id: string) => props.find((p) => p.id === id)!;
  const nightsBetween = (checkIn: string, checkOut: string) =>
    Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);

  const make = (
    id: string, property: Property, roomIndex: number, guestId: string,
    checkIn: string, checkOut: string, guests: number,
    status: Booking['status'], paymentStatus: Booking['paymentStatus'], createdAt: string,
  ): Booking => {
    const room = property.rooms[roomIndex]!;
    const price = room.basePrice!;
    const nights = nightsBetween(checkIn, checkOut);
    return {
      id, guestId, ownerId: property.ownerId, propertyId: property.id, roomId: room.id,
      propertyName: property.name, roomName: room.name, checkIn, checkOut, guests, nights,
      nightlyPrice: { amount: price.amount, currency: price.currency },
      total: { amount: (Number(price.amount) * nights).toFixed(2), currency: price.currency },
      status, paymentStatus, paymentOrderId: null, holdExpiresAt: null, cancellationReason: null,
      createdAt, updatedAt: createdAt,
    };
  };

  // All owned by OWNER_ID. Distinct createdAt so the owner history order (DESC) is deterministic:
  // cabanaPending (11-05) > casaAzulConfirmed (10-01) > villaCompleted (09-01).
  return [
    make(BOOKING_IDS.casaAzulConfirmed, prop(PROPERTY_IDS.casaAzul), 0, GUEST_ID, '2026-12-10', '2026-12-14', 2, 'CONFIRMED', 'CAPTURED', '2026-10-01T12:00:00.000Z'),
    make(BOOKING_IDS.villaCompleted, prop(PROPERTY_IDS.villa), 0, GUEST_ID, '2026-09-05', '2026-09-08', 2, 'COMPLETED', 'CAPTURED', '2026-09-01T10:00:00.000Z'),
    make(BOOKING_IDS.cabanaCancelled, prop(PROPERTY_IDS.cabana), 0, OTHER_GUEST_ID, '2027-03-01', '2027-03-05', 3, 'CANCELLED_BY_GUEST', 'REFUNDED', '2026-11-05T10:00:00.000Z'),
  ];
}
