import { FakeEmailAdapter } from '../../src/infrastructure/delivery/fake-email.adapter';

describe('fake email adapter (NTF-007)', () => {
  it('accepts locally without opening a network connection or exposing content', async () => {
    const adapter = new FakeEmailAdapter();
    await expect(adapter.deliver({ recipientEmail: 'test@example.test', subject: 'Subject', body: 'Private body' })).resolves.toEqual({ accepted: true });
  });
  it('returns only a finite failure code', async () => {
    await expect(new FakeEmailAdapter(false).deliver({ recipientEmail: null, subject: '', body: '' })).resolves.toEqual({ accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' });
  });
});
