import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import {
  ENTROPY_GENERATOR,
  UUID_GENERATOR,
  type EntropyGenerator,
  type UuidGenerator,
} from '@auth/application/ports/random.port';
import { AuthConfigModule } from '@auth/infrastructure/config/config.module';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';

const systemClock: Clock = { now: () => new Date() };
const uuidGenerator: UuidGenerator = { generate: randomUUID };
const entropyGenerator: EntropyGenerator = {
  generate: (bytes: number) => new Uint8Array(randomBytes(bytes)),
};

@Module({
  imports: [AuthConfigModule],
  providers: [
    AuthLogger,
    { provide: CLOCK, useValue: systemClock },
    { provide: UUID_GENERATOR, useValue: uuidGenerator },
    { provide: ENTROPY_GENERATOR, useValue: entropyGenerator },
  ],
  exports: [AuthConfigModule, AuthLogger, CLOCK, UUID_GENERATOR, ENTROPY_GENERATOR],
})
export class CoreModule {}
