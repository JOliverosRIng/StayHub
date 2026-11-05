import { Global, Module } from '@nestjs/common';
import { ACCOMMODATIONS_CONFIG, loadAccommodationsConfig } from './accommodations-config';
@Global()
@Module({ providers: [{ provide: ACCOMMODATIONS_CONFIG, useFactory: (): ReturnType<typeof loadAccommodationsConfig> => loadAccommodationsConfig() }], exports: [ACCOMMODATIONS_CONFIG] })
export class ConfigModule {}
