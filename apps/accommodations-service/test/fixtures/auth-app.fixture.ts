import { Controller, HttpCode, Post, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '../../src/infrastructure/config/accommodations-config';
import { AccommodationsLogger } from '../../src/infrastructure/logging/accommodations-logger';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { JwtAuthGuard } from '../../src/interfaces/http/auth/jwt.strategy';
import { CurrentPrincipal } from '../../src/interfaces/http/auth/principal.decorator';
import { RolesGuard } from '../../src/interfaces/http/guards/roles.guard';
import { Roles } from '../../src/interfaces/http/guards/roles.decorator';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import type { Principal } from '../../src/domain/properties/property.types';
import { testConfig } from './config.fixture';

@Controller('probe')
class ProbeController {
  @Post('owner')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  owner(@CurrentPrincipal() principal: Principal): Principal { return principal; }
}

/** Boots only the authentication module behind a probe mutation, so guard behaviour is verified over real HTTP without a database. */
export async function authApp(config: AccommodationsConfig = testConfig()): Promise<{ app: INestApplication; server: Server }> {
  const configModule = { module: class TestConfigModule {}, global: true, providers: [{ provide: ACCOMMODATIONS_CONFIG, useValue: config }], exports: [ACCOMMODATIONS_CONFIG] };
  const moduleRef = await Test.createTestingModule({ imports: [configModule, AuthModule], controllers: [ProbeController] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app, new AccommodationsLogger(() => undefined));
  await app.init();
  return { app, server: app.getHttpServer() as Server };
}
