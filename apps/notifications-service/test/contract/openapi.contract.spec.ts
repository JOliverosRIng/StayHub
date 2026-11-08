import { readFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';
import { NotificationsController } from '../../src/interfaces/http/notifications/notifications.controller';
import { SendNotificationUseCase } from '../../src/application/notifications/send-notification.use-case';
import { ListUserNotificationsUseCase } from '../../src/application/notifications/list-user-notifications.use-case';
import { SendAuthGuard } from '../../src/interfaces/http/guards/send-auth.guard';
import { AccessJwtGuard } from '../../src/interfaces/http/guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../../src/interfaces/http/guards/notification-ownership.guard';
import { createNotificationsOpenApi } from '../../src/interfaces/openapi/openapi.factory';

type ContractOpenApi = OpenAPIObject & { components: NonNullable<OpenAPIObject['components']>; paths: NonNullable<OpenAPIObject['paths']> };

describe('notifications OpenAPI (NTF-013)', () => {
  it('validates YAML and the Nest-generated document against the approved paths and operations', async () => {
    const parsed: unknown = YAML.parse(readFileSync('../../specs/003-notificaciones/contracts/openapi-notifications-service.yaml', 'utf8'));
    const contract = parsed as ContractOpenApi;
    await SwaggerParser.validate(contract as never);
    const builder = Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: SendNotificationUseCase, useValue: { execute: jest.fn() } },
        { provide: ListUserNotificationsUseCase, useValue: { execute: jest.fn() } },
      ],
    });
    builder.overrideGuard(SendAuthGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(AccessJwtGuard).useValue({ canActivate: (): boolean => true });
    builder.overrideGuard(NotificationOwnershipGuard).useValue({ canActivate: (): boolean => true });
    const module = await builder.compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      const generated = createNotificationsOpenApi(app);
      await SwaggerParser.validate(generated as never);
      expect(Object.keys(contract.paths).sort()).toEqual(['/notifications/send', '/notifications/user/{id}'].sort());
      expect(Object.keys(generated.paths).sort()).toEqual(Object.keys(contract.paths).sort());
      expect(generated.paths['/notifications/send']?.post?.operationId).toBe('sendNotification');
      expect(generated.paths['/notifications/user/{id}']?.get?.operationId).toBe('listUserNotifications');
      expect(generated.components?.securitySchemes).toHaveProperty('accessJwt');
      expect(generated.components?.securitySchemes).toHaveProperty('serviceJwt');
      expect(contract.components.securitySchemes).toHaveProperty('accessJwt');
      expect(contract.components.securitySchemes).toHaveProperty('serviceJwt');
    } finally {
      await app.close();
    }
  });
});
