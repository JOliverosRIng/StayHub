import { NotificationsClient } from '@bookings/infrastructure/http/notifications.client';

const config = {
  notificationsUrl: 'http://notifications',
  notificationsJwtAudience: 'stayhub-notifications-service',
  notificationsJwtScope: 'notifications:send',
  notificationsTimeoutMs: 1000,
} as never;
const tokens = { getToken: jest.fn(async () => 'notifications-token') };
const health = { recordSuccess: jest.fn(), recordFailure: jest.fn() };
const command = {
  userId: '11111111-1111-4111-8111-111111111111',
  bookingId: '22222222-2222-4222-8222-222222222222',
  propertyName: 'Hotel',
  roomName: 'Suite',
  checkIn: '2030-01-01',
  checkOut: '2030-01-02',
  guests: 2,
  totalPrice: '20.00',
  checkInAt: '2030-01-01T00:00:00.000Z',
};
const confirmation = {
  id: '33333333-3333-4333-8333-333333333333',
  userId: command.userId,
  type: 'BOOKING_CONFIRMATION',
  channel: 'IN_APP',
  status: 'SENT',
};
const response = (status: number, body: unknown = {}): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const fetchMock = jest.fn();

describe('NotificationsClient', () => {
  beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock as unknown as typeof fetch; });

  it('posts the canonical booking-confirmed payload and validates the response', async () => {
    fetchMock.mockResolvedValue(response(201, { confirmation, reminderScheduledAt: '2029-12-31T00:00:00.000Z' }));
    await expect(new NotificationsClient(config, tokens, health as never).sendBookingConfirmed(command)).resolves.toBeUndefined();
    expect(tokens.getToken).toHaveBeenCalledWith('stayhub-notifications-service', 'notifications:send');
    expect(fetchMock).toHaveBeenCalledWith('http://notifications/notifications/events/booking-confirmed', expect.objectContaining({
      method: 'POST',
      headers: { authorization: 'Bearer notifications-token', 'content-type': 'application/json' },
      body: JSON.stringify(command),
    }));
  });

  it('accepts an idempotent replay with 200 and the same canonical response', async () => {
    fetchMock.mockResolvedValue(response(200, { confirmation, reminderScheduledAt: '2029-12-31T00:00:00.000Z' }));
    await expect(new NotificationsClient(config, tokens, health as never).sendBookingConfirmed(command)).resolves.toBeUndefined();
  });

  it.each([
    [400, 'PERMANENT', 'NOTIFICATIONS_REJECTED'],
    [401, 'PERMANENT', 'NOTIFICATIONS_UNAUTHORIZED'],
    [403, 'PERMANENT', 'NOTIFICATIONS_UNAUTHORIZED'],
    [409, 'PERMANENT', 'NOTIFICATIONS_CONFLICT'],
    [429, 'RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE'],
    [500, 'RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE'],
    [503, 'RETRYABLE', 'NOTIFICATIONS_UNAVAILABLE'],
  ])('maps HTTP %i to %s/%s', async (status, kind, code) => {
    fetchMock.mockResolvedValue(response(status));
    await expect(new NotificationsClient(config, tokens, health as never).sendBookingConfirmed(command)).rejects.toMatchObject({ kind, code });
  });

  it('maps transport failures to a retryable error', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(new NotificationsClient(config, tokens, health as never).sendBookingConfirmed(command)).rejects.toMatchObject({ kind: 'RETRYABLE', code: 'NOTIFICATIONS_UNAVAILABLE' });
  });

  it.each([
    { confirmation: { ...confirmation, userId: '99999999-9999-4999-8999-999999999999' }, reminderScheduledAt: '2029-12-31T00:00:00.000Z' },
    { confirmation: { ...confirmation, type: 'SYSTEM_ALERT' }, reminderScheduledAt: '2029-12-31T00:00:00.000Z' },
    { confirmation },
    { confirmation, reminderScheduledAt: 'not-a-date' },
    null,
  ])('rejects an invalid response closed', async (body) => {
    fetchMock.mockResolvedValue(response(201, body));
    await expect(new NotificationsClient(config, tokens, health as never).sendBookingConfirmed(command)).rejects.toMatchObject({ kind: 'PERMANENT', code: 'NOTIFICATIONS_INVALID_RESPONSE' });
  });
});
