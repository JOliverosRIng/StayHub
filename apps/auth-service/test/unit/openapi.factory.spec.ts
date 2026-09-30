import { REGISTER_ACCOUNT_USE_CASE } from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { createAuthOpenApi } from '@auth/interfaces/openapi/openapi.factory';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';

const systemClock: Clock = { now: (): Date => new Date() };

describe('createAuthOpenApi registration contract (AUTH-047)', () => {
  let opened: AuthTestApp | null = null;

  afterEach(async () => {
    if (opened !== null) {
      await opened.close();
      opened = null;
    }
  });

  it('documents the registration operation with all contractual responses', async () => {
    opened = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: REGISTER_ACCOUNT_USE_CASE, useValue: { execute: jest.fn() } },
      ],
      controllers: [RegistrationController],
    });

    const document = createAuthOpenApi(opened.app);
    const operation = document.paths['/internal/v1/registrations']?.post;

    expect(operation?.operationId).toBe('orchestrateRegistration');
    expect(operation?.security).toEqual([{ serviceAuth: [] }]);
    for (const status of ['201', '400', '401', '409', '503']) {
      expect(operation?.responses[status]).toBeDefined();
    }
    const hasKeyHeader = operation?.parameters?.some(
      (parameter) => 'name' in parameter && parameter.name === 'Idempotency-Key',
    );
    expect(hasKeyHeader).toBe(true);
  });

  it('stabilises schema names and closes request schemas', async () => {
    opened = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: REGISTER_ACCOUNT_USE_CASE, useValue: { execute: jest.fn() } },
      ],
      controllers: [RegistrationController],
    });

    const document = createAuthOpenApi(opened.app);
    const schemas = (document.components?.schemas ?? {}) as Record<string, Record<string, unknown>>;

    expect(schemas.RegisterCommand?.additionalProperties).toBe(false);
    expect(schemas.RegisterCommand?.required).toEqual(
      expect.arrayContaining(['name', 'email', 'password', 'role']),
    );
    expect(schemas.Problem?.properties).toMatchObject({
      instance: expect.anything() as unknown,
      errors: expect.anything() as unknown,
    });
    expect(schemas.UserSummary).toBeDefined();

    const operation = document.paths['/internal/v1/registrations']?.post;
    const created = operation?.responses['201'];
    if (created !== undefined && 'content' in created) {
      expect(created.content?.['application/json']?.schema).toMatchObject({
        $ref: '#/components/schemas/UserSummary',
      });
    }
  });
});
