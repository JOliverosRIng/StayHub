import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Test } from '@nestjs/testing';
import { NotificationsController } from '../../src/interfaces/http/notifications/notifications.controller';
import { SendNotificationUseCase } from '../../src/application/notifications/send-notification.use-case';
import { ListUserNotificationsUseCase, type ListNotificationsQuery, type NotificationPage } from '../../src/application/notifications/list-user-notifications.use-case';
import type { NotificationView } from '../../src/domain/notifications/notification.types';
import { SendAuthGuard } from '../../src/interfaces/http/guards/send-auth.guard';
import { AccessJwtGuard } from '../../src/interfaces/http/guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../../src/interfaces/http/guards/notification-ownership.guard';
import { ProblemFilter } from '../../src/interfaces/http/problem.filter';

describe('GET /notifications/user/{id} contract (NTF-012)', () => {
  let app: INestApplication | undefined;
  const received: ListNotificationsQuery[] = [];
  const list = jest.fn((query: ListNotificationsQuery): Promise<NotificationPage> => {
    received.push(query);
    const items: NotificationView[] = [];
    return Promise.resolve({ items, nextCursor: null });
  });

  beforeAll(async (): Promise<void> => {
    const builder = Test.createTestingModule({ controllers: [NotificationsController], providers: [
      { provide: SendNotificationUseCase, useValue: { execute: jest.fn() } },
      { provide: ListUserNotificationsUseCase, useValue: { execute: list } },
    ] });
    builder.overrideGuard(SendAuthGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(AccessJwtGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(NotificationOwnershipGuard).useValue({ canActivate: (): boolean => true });
    const module = await builder.compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });
  afterAll(async (): Promise<void> => { await app?.close(); });

  it('returns a no-store page with strict optional filters', async () => {
    if (!app) throw new Error('HTTP app not initialized');
    const id = '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66';
    await request(app.getHttpServer() as unknown as App).get(`/notifications/user/${id}?limit=10&status=SENT&type=SYSTEM_ALERT`).expect('Cache-Control', 'no-store').expect(200);
    expect(received[0]).toMatchObject({ userId: id, limit: 10, status: 'SENT', type: 'SYSTEM_ALERT' });
  });

  it('rejects malformed ids and unknown query fields', async () => {
    if (!app) throw new Error('HTTP app not initialized');
    await request(app.getHttpServer() as unknown as App).get('/notifications/user/not-a-uuid').expect(400);
    await request(app.getHttpServer() as unknown as App).get('/notifications/user/6b2bf6ea-4d76-4f3e-84a7-5a7857825b66?offset=1').expect(400);
  });
});
