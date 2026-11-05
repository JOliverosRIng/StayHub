const LOCATION = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['addressLine', 'city', 'region', 'country'],
  properties: {
    addressLine: { type: 'string', maxLength: 200 },
    city: { type: 'string', maxLength: 100 },
    region: { type: 'string', maxLength: 100 },
    country: { type: 'string', pattern: '^[A-Z]{2}$', example: 'CO' },
    postalCode: { type: 'string', maxLength: 20 },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
  },
};

const BASE_PRICE = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'string', example: '120000.00' },
    currency: { type: 'string', example: 'COP' },
  },
};

const ROOM_INPUT = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['name', 'capacity'],
  properties: {
    name: { type: 'string', maxLength: 120 },
    capacity: { type: 'integer', minimum: 1, example: 2 },
    basePrice: BASE_PRICE,
  },
};

export const PROPERTY_CREATE_EXAMPLE = {
  type: 'HOUSE',
  name: 'Casa Ana',
  location: { addressLine: 'Calle 1', city: 'Bogota', region: 'Cundinamarca', country: 'CO' },
  rooms: [{ name: 'Habitacion 1', capacity: 2 }],
};

export const PROPERTY_CREATE_BODY = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['type', 'name', 'location', 'rooms'],
  example: PROPERTY_CREATE_EXAMPLE,
  properties: {
    type: { type: 'string', enum: ['HOTEL', 'APARTMENT', 'HOUSE', 'OTHER'] },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 5000 },
    location: LOCATION,
    featureCodes: { type: 'array', maxItems: 50, uniqueItems: true, items: { type: 'string' } },
    rooms: { type: 'array', minItems: 1, items: ROOM_INPUT },
  },
};

export const PROPERTY_REPLACE_BODY = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['type', 'name', 'location', 'status', 'rooms', 'version'],
  example: { ...PROPERTY_CREATE_EXAMPLE, status: 'DRAFT', version: 1 },
  properties: {
    ...PROPERTY_CREATE_BODY.properties,
    status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] },
    version: { type: 'integer', minimum: 1, example: 1 },
    rooms: {
      type: 'array' as const,
      minItems: 1,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['name', 'capacity'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', maxLength: 120 },
          capacity: { type: 'integer', minimum: 1 },
          basePrice: BASE_PRICE,
        },
      },
    },
  },
};

export const PROPERTY_PHOTO_BODY = {
  type: 'object' as const,
  required: ['file'],
  properties: { file: { type: 'string', format: 'binary' } },
};
