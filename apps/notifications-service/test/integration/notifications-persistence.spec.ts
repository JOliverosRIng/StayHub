import { readFileSync } from 'node:fs';

describe('notifications persistence schema (NTF-005)', () => {
  it('declares isolated PostgreSQL storage with global idempotency uniqueness and user history indexes', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('url      = env("NOTIFICATIONS_DATABASE_URL")');
    expect(schema).toContain('idempotencyKey     String              @unique');
    expect(schema).toContain('@@index([userId, createdAt(sort: Desc), id(sort: Desc)])');
    expect(schema).not.toMatch(/@relation\s*\(/);
  });
});
