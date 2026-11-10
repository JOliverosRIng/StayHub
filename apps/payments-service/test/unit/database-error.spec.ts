import { Prisma } from '../../src/infrastructure/persistence/generated/client';
import { isDatabaseUnavailable } from '../../src/infrastructure/persistence/prisma/database-error';

const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('synthetic database error', {
    code,
    clientVersion: '6.19.0',
  });

describe('isDatabaseUnavailable', () => {
  it.each(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034'])(
    'recognizes Prisma database outage code %s',
    (code) => {
      expect(isDatabaseUnavailable(knownError(code))).toBe(true);
    },
  );

  it('does not classify domain conflicts or unknown values as outages', () => {
    expect(isDatabaseUnavailable(knownError('P2002'))).toBe(false);
    expect(isDatabaseUnavailable(new Error('synthetic'))).toBe(false);
  });
});
