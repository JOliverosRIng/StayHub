import { HttpException } from '@nestjs/common';
import { UsersLogger, type SafeLog } from '../../src/infrastructure/logging/users-logger';
import { mapProblem } from '../../src/interfaces/http/problem.mapper';
import { DomainError } from '../../src/domain/shared/domain-error';
describe('USR-076 no PII/secrets in diagnostics', () => {
  it('logs only a bounded Prisma code for profile failures, never raw errors', () => {
    const lines: SafeLog[] = []; const logger = new UsersLogger((line) => lines.push(line));
    logger.profileUpdateFailure('P2028');
    logger.profileUpdateFailure(new Error('person@example.test Bearer secret-token'));
    logger.profileUpdateFailure('P2028 person@example.test');
    expect(lines).toEqual(['P2028', 'UNKNOWN', 'UNKNOWN'].map((errorCode) => ({
      event: 'dependency_unavailable', level: 'error', service: 'users-service', operation: 'profile.update', errorCode,
    })));
  });
  it('drops arbitrary framework payloads, even deeply nested secrets', () => {
    const lines: SafeLog[] = []; const logger = new UsersLogger((line) => lines.push(line));
    // LoggerService receives arbitrary framework data, but serializes only safe event metadata.
    const framework: import('@nestjs/common').LoggerService = logger;
    for (const value of ['person@example.test', 'Bearer secret-token', { password: 'sensitive', photo: Buffer.from('sensitive'), nested: { token: 'sensitive' } }, new Error('postgres://user:secret@host/users_db')]) {
      framework.log(value); framework.error(value); framework.warn(value);
    }
    logger.event('http_request', { traceId: 'person@example.test', status: 400, durationMs: 1 });
    const output = JSON.stringify(lines);
    expect(output).not.toMatch(/person@|secret|password|sensitive|postgres:|Bearer/);
    expect(lines).toHaveLength(13);
  });
  it('returns generic safe errors and field codes', () => {
    for (const exception of [new Error('sensitive'), new HttpException('person@example.test', 400), new DomainError('EMAIL_CONFLICT')]) {
      const problem = mapProblem(exception, 'a'.repeat(32));
      expect(JSON.stringify(problem)).not.toMatch(/sensitive|person@/);
      expect(problem).toHaveProperty('instance', `urn:request:${'a'.repeat(32)}`);
      expect(problem).toHaveProperty('errors');
    }
  });
});
