import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import type { Server } from 'node:http';
import request from 'supertest';
import { Roles } from '../../src/interfaces/http/guards/roles.decorator';
import { RolesGuard } from '../../src/interfaces/http/guards/roles.guard';
import { UsersAuthModule } from '../../src/modules/users-auth.module';
import { ConfigModule } from '../../src/infrastructure/config/config.module';
import { USERS_CONFIG } from '../../src/infrastructure/config/users-config';
import { userToken, testConfig, pendingFixture } from '../fixtures/users.fixture';
@Controller('test-only') @UseGuards(AuthGuard('jwt'), RolesGuard)
class TestController {
  @Get('owner') @Roles('OWNER') owner(): object { return { allowed: true }; }
  @Get('any') anyRole(): object { return { allowed: true }; }
}
describe('USR-067 roles metadata on test-only routes', () => {
  let app: INestApplication;
  beforeAll(async () => { const m = await Test.createTestingModule({ imports: [ConfigModule, UsersAuthModule], controllers: [TestController], providers: [RolesGuard] }).overrideProvider(USERS_CONFIG).useValue(testConfig('postgresql://users:synthetic@localhost/users_db')).compile(); app = m.createNestApplication({ logger: false }); await app.init(); });
  afterAll(async () => { await app.close(); });
  it('401 precedes role validation; guest is 403; owner is 200', async () => {
    await request(app.getHttpServer() as Server).get('/test-only/owner').expect(401);
    await request(app.getHttpServer() as Server).get('/test-only/owner').set('Authorization', `Bearer ${userToken(pendingFixture().userId)}`).expect(403);
    await request(app.getHttpServer() as Server).get('/test-only/owner').set('Authorization', `Bearer ${userToken(pendingFixture().userId, { role: 'OWNER' })}`).expect(200);
    await request(app.getHttpServer() as Server).get('/test-only/any').set('Authorization', `Bearer ${userToken(pendingFixture().userId)}`).expect(200);
  });
});
