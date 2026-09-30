import type { Server } from 'node:http';
import { Controller, Get, UseGuards } from '@nestjs/common';
import request from 'supertest';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { AUTH_CACHE } from '@auth/application/ports/cache.port';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { HealthController } from '@auth/modules/health/health.controller';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';

@Controller('protected')
@UseGuards(ServiceAuthGuard)
class ProtectedController {
  @Get()
  public read(): { readonly ok: true } {
    return { ok: true };
  }
}

const systemClock: Clock = { now: () => new Date() };

describe('configureAuthHttp', () => {
  let opened: AuthTestApp | null = null;

  afterEach(async () => {
    if (opened !== null) {
      await opened.close();
      opened = null;
    }
  });

  it('serves health with a coherent traceId', async () => {
    opened = await createAuthTestApp({
      providers: [
        {
          provide: PrismaService,
          useValue: {
            isReachable: (): Promise<boolean> => Promise.resolve(true),
            hasAppliedMigrations: (): Promise<boolean> => Promise.resolve(true),
          },
        },
        { provide: AUTH_CACHE, useValue: { ping: (): Promise<boolean> => Promise.resolve(true) } },
      ],
      controllers: [HealthController],
    });

    const response = await request(serverOf(opened))
      .get('/health/live')
      .set('x-trace-id', 'trace-health-1234');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-trace-id']).toBe('trace-health-1234');
  });

  it('keeps the same traceId when a guard rejects before the controller', async () => {
    opened = await createAuthTestApp({
      providers: [ServiceJwtVerifier, { provide: CLOCK, useValue: systemClock }],
      controllers: [ProtectedController],
    });

    const response = await request(serverOf(opened))
      .get('/protected')
      .set('x-trace-id', 'trace-guard-123456');
    const body = response.body as { readonly status?: number; readonly traceId?: string };

    expect(response.status).toBe(401);
    expect(response.headers['x-trace-id']).toBe('trace-guard-123456');
    expect(body).toMatchObject({ status: 401, traceId: 'trace-guard-123456' });
  });

  it('generates one traceId before the guards when the header is absent', async () => {
    opened = await createAuthTestApp({
      providers: [ServiceJwtVerifier, { provide: CLOCK, useValue: systemClock }],
      controllers: [ProtectedController],
    });

    const response = await request(serverOf(opened)).get('/protected');
    const body = response.body as { readonly traceId?: string };

    expect(response.status).toBe(401);
    expect(response.headers['x-trace-id']).toBe(body.traceId);
    expect(response.headers['x-trace-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a valid inbound service token', async () => {
    opened = await createAuthTestApp({
      providers: [ServiceJwtVerifier, { provide: CLOCK, useValue: systemClock }],
      controllers: [ProtectedController],
    });
    const token = await opened.fixture.issueInboundServiceToken();

    const response = await request(serverOf(opened))
      .get('/protected')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

function serverOf(app: AuthTestApp): Server {
  return app.app.getHttpServer() as Server;
}
