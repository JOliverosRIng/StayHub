import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { NotificationsClient } from '@bookings/infrastructure/http/notifications.client';

const contractPath = resolve(__dirname, '../../../../specs/003-notificaciones/contracts/openapi-notifications-service.yaml');
const uuid = (suffix: number): string => `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const command = {
  userId: uuid(1),
  bookingId: uuid(2),
  propertyName: 'Hotel Central',
  roomName: 'Suite',
  checkIn: '2030-01-01',
  checkOut: '2030-01-02',
  guests: 2,
  totalPrice: '20.00',
  checkInAt: '2030-01-01T00:00:00.000Z',
};
const config = {
  notificationsUrl: 'http://notifications',
  notificationsJwtAudience: 'stayhub-notifications-service',
  notificationsJwtScope: 'notifications:send',
  notificationsTimeoutMs: 1000,
} as never;
const tokens = { getToken: jest.fn(async () => 'notifications-token') };
const health = { recordSuccess: jest.fn(), recordFailure: jest.fn() };

interface Api {
  components?: { schemas?: Record<string, object> };
}

describe('Bookings Notifications consumer contract', () => {
  it('sends a payload that validates against the Notifications BookingConfirmedEvent schema', async () => {
    const api = await SwaggerParser.dereference(contractPath) as unknown as Api;
    const schema = api.components?.schemas?.BookingConfirmedEvent;
    expect(schema).toBeDefined();
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);

    let captured: unknown;
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON string body');
      captured = JSON.parse(init.body);
      return {
        ok: true, status: 201,
        json: async () => ({
          confirmation: { id: uuid(3), userId: command.userId, type: 'BOOKING_CONFIRMATION', channel: 'IN_APP', status: 'SENT' },
          reminderScheduledAt: '2029-12-31T00:00:00.000Z',
        }),
      } as Response;
    }) as unknown as typeof fetch;

    await expect(new NotificationsClient(config, tokens, health as never).sendBookingConfirmed(command)).resolves.toBeUndefined();
    expect(validate(captured)).toBe(true);
    expect(captured).toEqual(command);
  });

  it('rejects legacy room fields and numeric totals against the updated contract', async () => {
    const api = await SwaggerParser.dereference(contractPath) as unknown as Api;
    const schema = api.components?.schemas?.BookingConfirmedEvent;
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);
    expect(validate({ ...command, roomTitle: 'Suite', roomLocation: 'Bogotá' })).toBe(false);
    expect(validate({ ...command, totalPrice: 20 })).toBe(false);
    expect(validate({ ...command, propertyName: undefined })).toBe(false);
  });
});
