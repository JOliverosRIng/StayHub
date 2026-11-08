import { NotificationsLogger, redact } from '../../src/infrastructure/logging/notifications-logger';

describe('secret leakage protection (NTF-003)', () => {
  it('redacts nested body, email, token and key fields', () => {
    const safe = redact({ body: 'private text', email: 'a@b.test', subject: 'Booking', authorization: 'Bearer x', nested: { privateKey: 'pem' }, status: 'SENT' });
    expect(JSON.stringify(safe)).not.toMatch(/private text|a@b\.test|Booking|Bearer x|pem/);
    expect(safe).toMatchObject({ body: '[REDACTED]', email: '[REDACTED]', subject: '[REDACTED]', authorization: '[REDACTED]', status: 'SENT' });
  });

  it('redacts free-form logger messages', () => {
    const logger = new NotificationsLogger();
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.log('email=a@b.test and a private message body');
    expect(String(write.mock.calls[0]?.[0])).not.toMatch(/a@b\.test|private message body/);
    write.mockRestore();
  });
});
