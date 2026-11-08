import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { NotificationsController } from '../../src/interfaces/http/notifications/notifications.controller';
import { SendNotificationUseCase } from '../../src/application/notifications/send-notification.use-case';
import { SendAuthGuard } from '../../src/interfaces/http/guards/send-auth.guard';
import { ProblemFilter } from '../../src/interfaces/http/problem.filter';
import { ListUserNotificationsUseCase } from '../../src/application/notifications/list-user-notifications.use-case';
import { AccessJwtGuard } from '../../src/interfaces/http/guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../../src/interfaces/http/guards/notification-ownership.guard';
import { BookingConfirmedUseCase } from '../../src/application/notifications/booking-confirmed.use-case';
import { ServiceJwtGuard } from '../../src/interfaces/http/guards/service-jwt.guard';

describe('POST /notifications/send contract (NTF-009)', () => {
  let app: INestApplication | undefined;
  const execute = jest.fn().mockResolvedValue({ notification: { id: 'n1', status: 'SENT' }, replayed: false });

  beforeAll(async (): Promise<void> => {
    const builder = Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: SendNotificationUseCase, useValue: { execute } }, { provide: ListUserNotificationsUseCase, useValue: { execute: jest.fn() } }, { provide: BookingConfirmedUseCase, useValue: { execute: jest.fn() } }],
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

  it('accepts valid contract and requires idempotency key', async () => {
    if (!app) throw new Error('HTTP app not initialized');
    await request(app.getHttpServer() as unknown as App).post('/notifications/send').set('Idempotency-Key', 'send-1').send({
      userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT', channel: 'IN_APP',
      templateData: { alertCode: 'SYSTEM_DOWN', title: 'Maintenance', message: 'Update soon' },
    }).expect(201);
    expect(execute).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer() as unknown as App).post('/notifications/send').send({}).expect(400);
  });

  it('rejects extra request and template properties before use case', async () => {
    if (!app) throw new Error('HTTP app not initialized');
    const before = execute.mock.calls.length;
    await request(app.getHttpServer() as unknown as App).post('/notifications/send').set('Idempotency-Key', 'send-2').send({
      userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT', channel: 'IN_APP', extra: true,
      templateData: { alertCode: 'SYSTEM_DOWN', title: 'Maintenance', message: 'Update soon', recipientEmail: 'secret@example.test' },
    }).expect(400);
    expect(execute).toHaveBeenCalledTimes(before);
  });
});
