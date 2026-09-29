import type { Harness } from '../integration/postgres.setup';
import { pendingFixture } from './users.fixture';
export async function activeFixture(h: Harness, role: 'GUEST' | 'OWNER' | 'ADMIN' = 'GUEST'): Promise<string> {
  const body = pendingFixture();
  await h.db.user.create({ data: { id: body.userId, registrationId: body.registrationId, name: body.name, email: body.email, emailNormalized: body.email, role, status: 'ACTIVE' } });
  return body.userId;
}
export const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
export const jpeg = Buffer.from('ffd8ffe000104a4649460001', 'hex');
