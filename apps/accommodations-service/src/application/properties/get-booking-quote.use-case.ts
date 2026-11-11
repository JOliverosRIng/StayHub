import type { PropertyRepository } from '../ports/property.repository';
import { DomainError } from '@accommodations/domain/shared/domain-error';

export interface BookingQuote {
  propertyId: string;
  roomId: string;
  ownerId: string;
  propertyName: string;
  roomName: string;
  propertyStatus: 'PUBLISHED';
  capacity: number;
  basePrice: { amount: string; currency: string };
  propertyVersion: number;
  roomUpdatedAt: string;
}

export class GetBookingQuoteUseCase {
  constructor(private readonly properties: PropertyRepository) {}

  async execute(propertyId: string, roomId: string, guests: number): Promise<BookingQuote> {
    if (!Number.isSafeInteger(guests) || guests < 1) {
      throw new DomainError('VALIDATION_ERROR', [{ field: 'guests', code: 'INVALID_VALUE' }]);
    }
    const property = await this.properties.findById(propertyId);
    if (!property || property.status !== 'PUBLISHED') throw new DomainError('NOT_FOUND');
    const room = property.rooms.find((candidate) => candidate.id === roomId);
    if (!room) throw new DomainError('NOT_FOUND');
    if (room.capacity < guests) throw new DomainError('STATE_CONFLICT');
    if (!room.basePrice) throw new DomainError('STATE_CONFLICT');
    return {
      propertyId: property.id,
      roomId: room.id,
      ownerId: property.ownerId,
      propertyName: property.name,
      roomName: room.name,
      propertyStatus: 'PUBLISHED',
      capacity: room.capacity,
      basePrice: room.basePrice,
      propertyVersion: property.version,
      roomUpdatedAt: property.updatedAt.toISOString(),
    };
  }
}
