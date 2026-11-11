import { randomUUID } from 'node:crypto';
import { GetBookingQuoteUseCase } from '../../src/application/properties/get-booking-quote.use-case';
import type { Property } from '../../src/domain/properties/property.types';

const roomId = randomUUID();
const property: Property = {
  id: randomUUID(), ownerId: randomUUID(), type: 'HOTEL', name: 'Hotel E2E', description: null,
  location: { addressLine: 'Calle 1', city: 'Bogotá', region: 'Cundinamarca', country: 'CO' },
  status: 'PUBLISHED', version: 4,
  rooms: [{ id: roomId, name: 'Suite', capacity: 2, basePrice: { amount: '100.00', currency: 'USD' } }],
  features: [], photos: [], createdAt: new Date('2030-01-01T00:00:00.000Z'), updatedAt: new Date('2030-01-02T00:00:00.000Z'),
};

function useCase(value: unknown = property): GetBookingQuoteUseCase {
  return new GetBookingQuoteUseCase({ findById: jest.fn().mockResolvedValue(value) } as never);
}

describe('GetBookingQuoteUseCase', () => {
  it('returns the authoritative published snapshot', async () => {
    await expect(useCase().execute(property.id, roomId, 2)).resolves.toEqual({
      propertyId: property.id, roomId, ownerId: property.ownerId, propertyName: 'Hotel E2E', roomName: 'Suite',
      propertyStatus: 'PUBLISHED', capacity: 2, basePrice: { amount: '100.00', currency: 'USD' },
      propertyVersion: 4, roomUpdatedAt: '2030-01-02T00:00:00.000Z',
    });
  });

  it.each([
    ['missing property', null],
    ['unpublished property', { ...property, status: 'DRAFT' }],
  ])('returns NOT_FOUND for a %s', async (_name, value) => {
    await expect(useCase(value).execute(property.id, roomId, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for a room outside the property', async () => {
    await expect(useCase().execute(property.id, randomUUID(), 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns STATE_CONFLICT when capacity or price is invalid', async () => {
    await expect(useCase().execute(property.id, roomId, 3)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    const noPrice = { ...property, rooms: [{ ...property.rooms[0]!, basePrice: null }] };
    await expect(useCase(noPrice).execute(property.id, roomId, 1)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('returns VALIDATION_ERROR for a non-positive guest count', async () => {
    await expect(useCase().execute(property.id, roomId, 0)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
