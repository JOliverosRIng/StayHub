import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { NotificationsController } from '../../src/interfaces/http/notifications/notifications.controller';
import { SendNotificationUseCase } from '../../src/application/notifications/send-notification.use-case';
import { ListUserNotificationsUseCase } from '../../src/application/notifications/list-user-notifications.use-case';
import { BookingConfirmedUseCase } from '../../src/application/notifications/booking-confirmed.use-case';
import { SendAuthGuard } from '../../src/interfaces/http/guards/send-auth.guard';
import { AccessJwtGuard } from '../../src/interfaces/http/guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../../src/interfaces/http/guards/notification-ownership.guard';
import { ServiceJwtGuard } from '../../src/interfaces/http/guards/service-jwt.guard';
import { ProblemFilter } from '../../src/interfaces/http/problem.filter';

const canonical = {
  userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66',
  bookingId: '22222222-2222-4222-8222-222222222222',
  propertyName: 'Hotel Central',
  roomName: 'Suite',
  checkIn: '2030-01-01',
  checkOut: '2030-01-02',
  guests: 2,
  totalPrice: '20.00',
  checkInAt: '2030-01-01T00:00:00.000Z',
};

describe('POST /notifications/events/booking-confirmed contract', () => {
  let app: INestApplication | undefined;
  const execute = jest.fn().mockResolvedValue({
    confirmation: {
      id: '33333333-3333-4333-8333-333333333333', userId: canonical.userId, type: 'BOOKING_CONFIRMATION',
      channel: 'IN_APP', subject: 'Reserva confirmada', body: 'Reserva confirmada', status: 'SENT',
      createdAt: '2029-12-01T12:00:00.000Z', sentAt: '2029-12-01T12:00:00.000Z',
    },
    reminderScheduledAt: '2029-12-31T00:00:00.000Z',
  });

  beforeAll(async (): Promise<void> => {
    const builder = Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: SendNotificationUseCase, useValue: { execute: jest.fn() } },
        { provide: ListUserNotificationsUseCase, useValue: { execute: jest.fn() } },
        { provide: BookingConfirmedUseCase, useValue: { execute } },
      ],
    });
    builder.overrideGuard(SendAuthGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(AccessJwtGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(NotificationOwnershipGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(ServiceJwtGuard).useValue({ canActivate: (): boolean => true });
    const module = await builder.compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transform: true }));
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });
  afterAll(async (): Promise<void> => { await app?.close(); });

  it('accepts the canonical propertyName/roomName/string totalPrice contract', async () => {
    if (!app) throw new Error('HTTP app not initialized');
    await request(app.getHttpServer() as unknown as App).post('/notifications/events/booking-confirmed').send(canonical).expect(201);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['legacy room fields', { ...canonical, roomTitle: 'Suite', roomLocation: 'Bogotá' }],
    ['missing propertyName', { ...canonical, propertyName: undefined }],
    ['numeric totalPrice', { ...canonical, totalPrice: 20 }],
    ['unknown field', { ...canonical, extra: true }],
  ])('rejects %s before the use case', async (_name, body) => {
    if (!app) throw new Error('HTTP app not initialized');
    const before = execute.mock.calls.length;
    await request(app.getHttpServer() as unknown as App).post('/notifications/events/booking-confirmed').send(body).expect(400);
    expect(execute).toHaveBeenCalledTimes(before);
  });
});
