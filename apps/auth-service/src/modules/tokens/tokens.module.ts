import { Module } from '@nestjs/common';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '@auth/application/ports/random.port';
import {
  REFRESH_TOKEN_CODEC,
  type RefreshTokenCodec,
} from '@auth/application/ports/refresh-token-codec.port';
import { TOKEN_SIGNER, type TokenSigner } from '@auth/application/ports/token-signer.port';
import {
  ISSUE_SESSION_TOKENS,
  IssueSessionTokensService,
} from '@auth/application/sessions/issue-session-tokens.service';
import { HmacRefreshTokenCodec } from '@auth/infrastructure/security/hmac-refresh-token.codec';
import { Rs256TokenService } from '@auth/infrastructure/security/rs256-token.service';
import { CoreModule } from '@auth/modules/core/core.module';

@Module({
  imports: [CoreModule],
  providers: [
    Rs256TokenService,
    { provide: TOKEN_SIGNER, useExisting: Rs256TokenService },
    HmacRefreshTokenCodec,
    { provide: REFRESH_TOKEN_CODEC, useExisting: HmacRefreshTokenCodec },
    {
      provide: ISSUE_SESSION_TOKENS,
      useFactory: (
        codec: RefreshTokenCodec,
        signer: TokenSigner,
        uuid: UuidGenerator,
        clock: Clock,
      ): IssueSessionTokensService => new IssueSessionTokensService({ codec, signer, uuid, clock }),
      inject: [REFRESH_TOKEN_CODEC, TOKEN_SIGNER, UUID_GENERATOR, CLOCK],
    },
  ],
  exports: [TOKEN_SIGNER, REFRESH_TOKEN_CODEC, ISSUE_SESSION_TOKENS],
})
export class TokensModule {}
