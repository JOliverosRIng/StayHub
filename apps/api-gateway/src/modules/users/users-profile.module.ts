import { Module } from '@nestjs/common';

import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { UsersProfileClient } from '@gateway/infrastructure/http/users-profile.client';

import { ProfileController } from './profile.controller';
import { ProfilePhotoController } from './profile-photo.controller';
import { ProfileStreamingInterceptor } from './profile-streaming.interceptor';

/**
 * GW-048 — Módulo de las rutas de perfil y foto. Cablea los controladores autenticados (protegidos
 * por los guards globales de GW-040) con el cliente Users de GW-046 y el interceptor de streaming
 * de GW-047. El cliente Users usa el bearer del usuario (bearerAuth), por lo que su emisor de
 * service token es irrelevante aquí.
 */
@Module({
  imports: [GatewayConfigModule],
  controllers: [ProfileController, ProfilePhotoController],
  providers: [
    ProfileStreamingInterceptor,
    {
      provide: UsersProfileClient,
      useFactory: (config: GatewayConfig): UsersProfileClient =>
        new UsersProfileClient(config, { issue: (): Promise<string> => Promise.resolve('') }),
      inject: [GATEWAY_CONFIG],
    },
  ],
})
export class UsersProfileModule {}
