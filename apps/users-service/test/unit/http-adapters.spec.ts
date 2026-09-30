import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { USERS_CONFIG } from '../../src/infrastructure/config/users-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { USER_REPOSITORY, LOGIN_IDENTITY_REPOSITORY } from '../../src/application/ports/user.repository';
import { PROFILE_REPOSITORY } from '../../src/application/ports/profile.repository';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { createOpenApi } from '../../src/interfaces/openapi/openapi.factory';
import { UsersLogger, type SafeLog } from '../../src/infrastructure/logging/users-logger';
import { DomainError } from '../../src/domain/shared/domain-error';
import { pendingFixture, serviceToken, testConfig, userToken } from '../fixtures/users.fixture';
import { png } from '../fixtures/profile.fixture';
import { preparePhoto } from '../../src/infrastructure/files/profile-photo.service';

describe('HTTP adapters with application ports isolated (unit)', () => {
  let app: INestApplication; let server: Server;
  const command = pendingFixture(); const id = command.userId;
  const profile = { id, name: command.name, email: command.email, role: 'GUEST', phone: null, preferences: null, photoUrl: null, version: 1 };
  const users = { create: jest.fn(), transition: jest.fn(), findByRegistrationId: jest.fn() };
  const profiles = { find: jest.fn(), update: jest.fn(), photo: jest.fn() };
  const lookup = { findActiveLoginIdentityByNormalizedEmail: jest.fn() };
  const ready = jest.fn(); const logs: SafeLog[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(USERS_CONFIG).useValue(testConfig('postgresql://users:synthetic@localhost/users_db'))
      .overrideProvider(PrismaService).useValue({ ready }).overrideProvider(USER_REPOSITORY).useValue(users).overrideProvider(PROFILE_REPOSITORY).useValue(profiles).overrideProvider(LOGIN_IDENTITY_REPOSITORY).useValue(lookup).compile();
    app = module.createNestApplication({ logger: false }); configureHttp(app, new UsersLogger((record) => logs.push(record))); await app.init(); server = app.getHttpServer() as Server;
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); users.create.mockResolvedValue({ id, name: command.name, email: command.email, role: 'GUEST', status: 'PENDING' }); users.transition.mockResolvedValue({ id, status: 'ACTIVE' }); profiles.find.mockResolvedValue(profile); profiles.update.mockResolvedValue({ ...profile, version: 2 }); profiles.photo.mockResolvedValue(preparePhoto(png, 'image/png')); });
  const path = `/internal/v1/users/${id}/profile`;
  it('maps registration commands and excludes password/unknown fields before use case', async () => {
    const auth = `Bearer ${serviceToken()}`;
    await request(server).post('/internal/v1/registrations').set('Authorization', auth).send(command).expect(201);
    expect(users.create).toHaveBeenCalledWith(command);
    await request(server).post(`/internal/v1/registrations/${command.registrationId}/activate`).set('Authorization', auth).expect(200);
    await request(server).post(`/internal/v1/registrations/${command.registrationId}/cancel`).set('Authorization', auth).expect(204);
    await request(server).post(`/internal/v1/registrations/${command.registrationId}/cancel`).set('Authorization', auth).send({ role: 'ADMIN' }).expect(400);
    await request(server).post('/internal/v1/registrations').set('Authorization', auth).send({ ...command, password: 'secret' }).expect(400);
    expect(users.create).toHaveBeenCalledTimes(1);
  });
  it('maps service scope and invalid identity before use case', async () => {
    await request(server).post('/internal/v1/registrations').send(command).expect(401);
    await request(server).post('/internal/v1/registrations').set('Authorization', `Bearer ${serviceToken('wrong')}`).send(command).expect(403);
    expect(users.create).not.toHaveBeenCalled();
  });
  it('sanitizes lookup projection and trims email before port call', async () => {
    lookup.findActiveLoginIdentityByNormalizedEmail.mockResolvedValue({ userId: id, role: 'GUEST', status: 'ACTIVE', password: 'secret' });
    const result = await request(server).post('/internal/v1/login-identities/resolve').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send({ email: ' PERSON@example.test ' }).expect(200);
    expect(result.body as unknown).toEqual({ userId: id, role: 'GUEST', status: 'ACTIVE' }); expect(lookup.findActiveLoginIdentityByNormalizedEmail).toHaveBeenCalledWith('person@example.test');
  });
  it('GET and binary photo use owner identity and never serialize filename', async () => {
    const auth = `Bearer ${userToken(id)}`;
    await request(server).get(path).set('Authorization', auth).expect(200);
    const photo = await request(server).get(`${path}/photo`).set('Authorization', auth).expect(200);
    expect(photo.body as unknown).toEqual(png); expect(profiles.photo).toHaveBeenCalledWith(id);
    profiles.find.mockResolvedValue(null); profiles.photo.mockResolvedValue(null);
    await request(server).get(path).set('Authorization', auth).expect(404); await request(server).get(`${path}/photo`).set('Authorization', auth).expect(404);
  });
  it('PATCH translates JSON field/file and drops the original filename', async () => {
    const auth = `Bearer ${userToken(id)}`;
    await request(server).patch(path).set('Authorization', auth).field('profile', JSON.stringify({ expectedVersion: 1, name: ' Updated ' })).attach('photo', png, { filename: 'person@example.test.png', contentType: 'image/png' }).expect(200);
    expect(profiles.update).toHaveBeenCalledWith(id, { expectedVersion: 1, name: 'Updated' }, preparePhoto(png, 'image/png'));
    await request(server).patch(path).set('Authorization', auth).attach('profile', Buffer.from(JSON.stringify({ expectedVersion: 1, phone: null })), { filename: 'profile.json', contentType: 'application/json' }).expect(200);
    expect(JSON.stringify(logs)).not.toContain('person@example.test');
  });
  it.each(['not-json', '[]', 'null', '{"expectedVersion":1}', '{"expectedVersion":1,"role":"ADMIN"}'])('rejects multipart JSON %s before port call', async (raw) => {
    await request(server).patch(path).set('Authorization', `Bearer ${userToken(id)}`).field('profile', raw).expect(400); expect(profiles.update).not.toHaveBeenCalled();
  });
  it('rejects content type, unknown parts, missing JSON and duplicate JSON', async () => {
    const auth = `Bearer ${userToken(id)}`;
    await request(server).patch(path).set('Authorization', auth).send({ expectedVersion: 1, name: 'Name' }).expect(415);
    await request(server).patch(path).set('Authorization', auth).field('unknown', 'x').expect(400);
    await request(server).patch(path).set('Authorization', auth).attach('photo', png, 'x.png').expect(400);
    await request(server).patch(path).set('Authorization', auth).field('profile', '{}').attach('profile', Buffer.from('{}'), { filename: 'p.json', contentType: 'application/json' }).expect(400);
    expect(profiles.update).not.toHaveBeenCalled();
  });
  it('denies cross-user ADMIN before body parsing', async () => {
    await request(server).patch(path).set('Authorization', `Bearer ${userToken(pendingFixture().userId, { role: 'ADMIN' })}`).field('profile', 'not-json').expect(403); expect(profiles.update).not.toHaveBeenCalled();
  });
  it('maps domain conflict and unexpected failures without secrets', async () => {
    profiles.find.mockRejectedValue(new Error('person@example.test secret'));
    const response = await request(server).get(path).set('Authorization', `Bearer ${userToken(id)}`).expect(500); expect(JSON.stringify(response.body)).not.toMatch(/person@|secret/);
    profiles.update.mockRejectedValue(new DomainError('VERSION_CONFLICT'));
    const result = await request(server).patch(path).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1, name: 'Name' })).expect(409); expect(result.body as unknown).toMatchObject({ code: 'VERSION_CONFLICT' });
  });
  it('exposes separate liveness/readiness and correlates a valid trace', async () => {
    const trace = 'a'.repeat(32); await request(server).get('/health/live').set('x-trace-id', trace).expect('x-trace-id', trace).expect(200);
    ready.mockResolvedValue(false); await request(server).get('/health/ready').expect(503);
    ready.mockResolvedValue(true); await request(server).get('/health/ready').expect(200);
  });
  it('generates only the published Users endpoints and both security schemes', () => {
    const doc = createOpenApi(app); expect(Object.keys(doc.paths)).toHaveLength(9); expect(doc.components?.securitySchemes).toHaveProperty('bearerAuth'); expect(doc.components?.securitySchemes).toHaveProperty('serviceAuth');
    expect(doc.paths['/internal/v1/registrations/{registrationId}']?.get?.operationId).toBe('getRegistration');
    expect(doc.paths['/internal/v1/users/{userId}/profile']?.patch?.requestBody).toHaveProperty('content.multipart/form-data.encoding.profile.contentType', 'application/json');
  });
});
