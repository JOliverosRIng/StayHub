import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import type { RefreshTokenCodec } from '@auth/application/ports/refresh-token-codec.port';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

const RAW_TOKEN_BYTES = 32;

@Injectable()
export class HmacRefreshTokenCodec implements RefreshTokenCodec {
  private readonly secret: string;

  public constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    if (config.refreshTokenHmacSecret.length < 32) {
      throw new Error('Refresh token HMAC secret must contain at least 32 characters');
    }
    this.secret = config.refreshTokenHmacSecret;
  }

  public generateRawToken(): string {
    return randomBytes(RAW_TOKEN_BYTES).toString('base64url');
  }

  public hash(rawToken: string): string {
    return createHmac('sha256', this.secret).update(rawToken).digest('hex');
  }
}
