import { randomUUID } from 'node:crypto';

export interface PerformanceDataset {
  ownerId: string;
  guestIds: string[];
  detailBookingId: string;
  rows: Array<Record<string, unknown>>;
}

export function performanceDataset(count = 400): PerformanceDataset {
  const ownerId = randomUUID();
  const guestIds = [randomUUID(), randomUUID(), randomUUID()];
  const statuses = ['CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED_BY_GUEST'] as const;
  const detailBookingId = randomUUID();
  const rows = Array.from({ length: count }, (_, index) => {
    const checkIn = new Date(Date.UTC(2034, 0, 1 + (index % 300)));
    const checkOut = new Date(checkIn.getTime() + 86_400_000 * (1 + (index % 3)));
    const createdAt = new Date(Date.UTC(2033, 0, 1) + index * 60_000);
    const id = index === 0 ? detailBookingId : randomUUID();
    return {
      id, guestId: guestIds[index % guestIds.length], ownerId, propertyId: randomUUID(), roomId: randomUUID(),
      propertyName: `Property ${index}`, roomName: `Room ${index}`,
      checkIn, checkOut, guests: 1, capacitySnapshot: 2, nightlyPriceAmount: '10.00', currency: 'USD',
      nights: Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000), totalAmount: '20.00',
      accommodationVersion: 1, roomSourceUpdatedAt: new Date(), status: statuses[index % statuses.length], paymentStatus: 'CAPTURED', createdAt, updatedAt: createdAt,
    };
  });
  return { ownerId, guestIds, detailBookingId, rows };
}
