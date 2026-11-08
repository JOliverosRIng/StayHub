import { InAppAdapter } from '../../src/infrastructure/delivery/in-app.adapter';

describe('in-app adapter (NTF-007)', () => {
  it('accepts persistence delivery without a provider call', async () => {
    await expect(new InAppAdapter().deliver({ recipientEmail: null, subject: 'Subject', body: 'Private body' })).resolves.toEqual({ accepted: true });
  });
});
