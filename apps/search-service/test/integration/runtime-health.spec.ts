import request from 'supertest';
import type { Server } from 'node:http';
import { createSearchTestApp } from '../helpers/search-app';
import { createServiceJwtFixture } from '../helpers/service-jwt.fixture';
import { describeWithPostgres, searchTestDatabaseUrl } from '../helpers/dependencies';

describeWithPostgres('Search application composition', () => {
  it('starts with migrated PostgreSQL and keeps reads ready when optional dependencies are offline', async () => {
    const fixture = await createServiceJwtFixture();
    const values: NodeJS.ProcessEnv = {
      SEARCH_DATABASE_URL: searchTestDatabaseUrl!, SEARCH_REDIS_URL: 'redis://127.0.0.1:1', SEARCH_RABBITMQ_URL: 'amqp://127.0.0.1:1',
      SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'test-key': fixture.publicKey }),
      SEARCH_SERVICE_JWT_ISSUER: 'stayhub-api-gateway', SEARCH_SERVICE_JWT_AUDIENCE: 'stayhub-search-service', SEARCH_SERVICE_JWT_SCOPE: 'search:invoke', SEARCH_DEPENDENCY_TIMEOUT_MS: '1000',
    };
    const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    try {
      const app = await createSearchTestApp();
      try {
        await request(app.getHttpServer() as Server).get('/health/live').expect(200);
        await request(app.getHttpServer() as Server).get('/health/ready').expect(200, { status: 'ready', degraded: ['redis', 'rabbitmq'] });
        await request(app.getHttpServer() as Server).get('/internal/v1/search?pageSize=1').set('Authorization', `Bearer ${await fixture.token()}`).expect(200);
      } finally { await app.close(); }
    } finally {
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
});
