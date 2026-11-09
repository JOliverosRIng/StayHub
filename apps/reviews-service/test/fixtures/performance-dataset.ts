import { randomUUID } from 'node:crypto';

export interface ReviewsPerformanceDataset {
  propertyId: string;
  guestId: string;
  rows: Array<{
    id: string;
    bookingId: string;
    propertyId: string;
    guestId: string;
    rating: number;
    comment: string;
    createdAt: Date;
  }>;
}

export function reviewsPerformanceDataset(count = 400): ReviewsPerformanceDataset {
  const propertyId = randomUUID();
  const guestId = randomUUID();
  const rows = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    bookingId: randomUUID(),
    propertyId,
    guestId,
    rating: (index % 5) + 1,
    comment: `Review ${index}`,
    createdAt: new Date(Date.UTC(2033, 0, 1) + index * 60_000),
  }));
  return { propertyId, guestId, rows };
}
