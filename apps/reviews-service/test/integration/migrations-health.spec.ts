import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('reviews migration', () => {
  const sql = readFileSync(resolve(__dirname, '../../prisma/migrations/001_reviews_core/migration.sql'), 'utf8');
  it('creates the isolated immutable review table', () => {
    expect(sql).toContain('CREATE TABLE "reviews"'); expect(sql).toContain('"bookingId" UUID NOT NULL');
    expect(sql).not.toMatch(/FOREIGN KEY|updatedAt|deletedAt|status/iu);
  });
  it('enforces booking uniqueness, rating/comment checks and stable indexes', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "reviews_bookingId_key"'); expect(sql).toContain('"rating" BETWEEN 1 AND 5');
    expect(sql).toContain('char_length(btrim("comment")) BETWEEN 1 AND 2000');
    expect(sql).toContain('("propertyId", "createdAt" DESC, "id" DESC)'); expect(sql).toContain('("guestId", "createdAt" DESC, "id" DESC)');
  });
});
