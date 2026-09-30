import { Module } from '@nestjs/common';

import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { UsersProfileClient } from '@gateway/infrastructure/http/users-profile.client';

import { ProfileController } from './profile.controller';
import { ProfileOwnershipGuard } from './profile-ownership.guard';
import { ProfilePhotoController } from './profile-photo.controller';
import { ProfileStreamingInterceptor } from './profile-streaming.interceptor';

/**
 * GW-054 — Módulo proxy de perfil/foto (US3 enrutado + US4 autorización). Aplica el pipeline de
 * autorización en orden ESTRICTO, sin duplicar lógica de las historias previas:
 *
 * 1. **Anti-spoofing (GW-052)** — `IdentityHeaderInterceptor` global (GW-022) elimina toda cabecera
 *    de identidad/forwarding/servicio del cliente antes del enrutado: la identidad solo puede venir
 *    del bearer.
 * 2. **Passport JWT RS256 (GW-016)** y **introspección obligatoria (GW-039)** — el `AccessGuard`
 *    global (GW-040) verifica el token, introspecciona la sesión (fuente autoritativa, fallo cerrado
 *    503) y comprueba coherencia de rol; ausente/ inválido/ sesión inactiva → `401`. Deja el
 *    principal validado en `request.user`.
 * 3. **Ownership (GW-053)** — `ProfileOwnershipGuard`, activo por `@UseGuards` en ambos controladores,
 *    corre DESPUÉS de los guards globales (precedencia `401 → 403`) y ANTES del manejador: si
 *    `principal.sub !== route.userId` responde `403` uniforme sin contactar a Users (ADMIN incluido).
 * 4. **Routing a Users (GW-046)** — solo una petición autenticada, introspeccionada y con ownership
 *    verificado alcanza el manejador, que delega en `UsersProfileClient` reenviando únicamente el
 *    bearer validado y el `traceId`.
 *
 * El cliente Users usa el bearer del usuario (bearerAuth), por lo que su emisor de service token es
 * irrelevante aquí. Cumple FR-011–FR-013, FR-020–FR-024, SC-003–SC-004 y la constitución (§II, §V).
 */
@Module({
  imports: [GatewayConfigModule],
  controllers: [ProfileController, ProfilePhotoController],
  providers: [
    ProfileStreamingInterceptor,
    ProfileOwnershipGuard,
    {
      provide: UsersProfileClient,
      useFactory: (config: GatewayConfig): UsersProfileClient =>
        new UsersProfileClient(config, { issue: (): Promise<string> => Promise.resolve('') }),
      inject: [GATEWAY_CONFIG],
    },
  ],
})
export class UsersProxyModule {}
