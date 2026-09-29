import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { REGISTER_ACCOUNT_USE_CASE } from '@auth/application/ports/auth-use-cases.port';
import { RECONCILE_REGISTRATIONS } from '@auth/application/registration/reconcile-registrations.use-case';
import { AUTH_CONFIG } from '@auth/infrastructure/config/auth-config';
import { configureAuthHttp } from '@auth/interfaces/http/configure-auth-http';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { RegistrationReconcilerService } from '@auth/modules/registration/registration-reconciler.service';
import { AppModule } from '../../src/app.module';
import { createAuthCryptoFixture, type AuthCryptoFixture } from '../helpers/crypto-fixture';
import { UsersStub } from '../helpers/users-stub';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const PASSWORD = 'Correct-Horse-Battery-Staple-42';

describe('registration module composition (AUTH-046)', () => {
  let dependencies: IntegrationDependencies;
  let stub: UsersStub;
  let fixture: AuthCryptoFixture;
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    stub = new UsersStub();
    const baseUrl = await stub.start();
    fixture = createAuthCryptoFixture({
      databaseUrl: process.env.TEST_AUTH_DATABASE_URL as string,
      redisUrl: process.env.TEST_AUTH_REDIS_URL as string,
      usersServiceUrl: baseUrl,
    });

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue(fixture.config)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureAuthHttp(app, { swagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await stub.stop();
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
    stub.reset();
  });

  function serverOf(application: INestApplication): Server {
    return application.getHttpServer() as Server;
  }

  it('resolves the productive registration providers without duplicates', () => {
    expect(moduleRef.get(REGISTER_ACCOUNT_USE_CASE, { strict: false })).toBeDefined();
    expect(moduleRef.get(RECONCILE_REGISTRATIONS, { strict: false })).toBeDefined();
    expect(moduleRef.get(RegistrationController, { strict: false })).toBeInstanceOf(
      RegistrationController,
    );
    expect(moduleRef.get(RegistrationReconcilerService, { strict: false })).toBeInstanceOf(
      RegistrationReconcilerService,
    );
  });

  it('serves a registration end-to-end through AppModule', async () => {
    const token = await fixture.issueInboundServiceToken();
    const key = randomUUID();

    const response = await request(serverOf(app))
      .post('/internal/v1/registrations')
      .set('authorization', `Bearer ${token}`)
      .set('idempotency-key', key)
      .send({
        name: 'Jane Guest',
        email: 'jane.guest@example.test',
        password: PASSWORD,
        role: 'GUEST',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Jane Guest',
      email: 'jane.guest@example.test',
      role: 'GUEST',
    });
    const registration = await dependencies.prisma.registration.findUnique({ where: { id: key } });
    expect(registration?.state).toBe('COMPLETED');
    expect(stub.find(key)?.status).toBe('ACTIVE');
  });

  it('keeps health endpoints available through AppModule', async () => {
    const live = await request(serverOf(app)).get('/health/live');
    expect(live.status).toBe(200);

    const ready = await request(serverOf(app)).get('/health/ready');
    expect(ready.status).toBe(200);
  });
});
