import { assertSafeCleanupTargets } from '../integration/dependencies.setup';

const TEST_DATABASE = 'postgresql://stayhub_auth:test@127.0.0.1:55432/auth_test';
const TEST_REDIS = 'redis://:test@127.0.0.1:56379/15';

describe('assertSafeCleanupTargets', () => {
  it('requires an explicit cleanup opt-in', () => {
    expect(() => assertSafeCleanupTargets(TEST_DATABASE, TEST_REDIS, undefined)).toThrow(
      /AUTH_TEST_ALLOW_CLEANUP=true/,
    );
  });

  it('rejects a database that is not a test database', () => {
    expect(() =>
      assertSafeCleanupTargets(
        'postgresql://stayhub_auth:test@127.0.0.1:5432/auth_db',
        TEST_REDIS,
        'true',
      ),
    ).toThrow(/must end with _test/);
  });

  it('rejects a Redis database other than 15', () => {
    expect(() =>
      assertSafeCleanupTargets(TEST_DATABASE, 'redis://:test@127.0.0.1:56379/0', 'true'),
    ).toThrow(/requires DB 15/);
  });

  it('accepts isolated test targets with the opt-in', () => {
    expect(() => assertSafeCleanupTargets(TEST_DATABASE, TEST_REDIS, 'true')).not.toThrow();
  });
});
