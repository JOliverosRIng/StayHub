import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '@reviews/infrastructure/persistence/prisma/prisma.service';
import { HealthController } from '@reviews/modules/health/health.controller';
import { ProblemDetailsFilter } from '@reviews/interfaces/http/problem.filter';
import { TraceInterceptor } from '@reviews/interfaces/http/trace.interceptor';

describe('health contract', () => {
  let app: INestApplication; const prisma = { isReady: jest.fn(async () => true) };
  beforeAll(async () => { const moduleRef = await Test.createTestingModule({ controllers: [HealthController], providers: [{ provide: PrismaService, useValue: prisma }] }).compile(); app = moduleRef.createNestApplication(); app.useGlobalFilters(new ProblemDetailsFilter()); app.useGlobalInterceptors(new TraceInterceptor()); await app.init(); });
  afterAll(async () => { await app.close(); });
  const server = (): Server => app.getHttpServer() as Server;
  it('keeps liveness independent', async () => { await request(server()).get('/health/live').expect(200, { status: 'ok' }); });
  it('reports DB and migrations readiness', async () => { await request(server()).get('/health/ready').expect(200).expect(({ body }) => expect(body).toMatchObject({ status: 'ready', database: 'up', migrations: 'applied', bookings: 'checked-per-request' })); });
  it('fails readiness without bypass when storage is unavailable', async () => { prisma.isReady.mockResolvedValueOnce(false); await request(server()).get('/health/ready').expect(503); });
});
