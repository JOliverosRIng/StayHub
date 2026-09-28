import { DomainValidationError } from '@auth/domain/shared/domain-error';

export type RefreshTokenStatus = 'ACTIVE' | 'CONSUMED' | 'REVOKED';

export interface RefreshTokenProperties {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly status: RefreshTokenStatus;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly replacedByTokenId: string | null;
}

export class RefreshToken {
  private constructor(private properties: RefreshTokenProperties) {}

  public static create(
    id: string,
    sessionId: string,
    tokenHash: string,
    issuedAt: Date,
    sessionExpiresAt: Date,
  ): RefreshToken {
    if (tokenHash.length !== 64 || sessionExpiresAt <= issuedAt) {
      throw new DomainValidationError('INVALID_REFRESH_TOKEN', 'Refresh token data is invalid');
    }
    return new RefreshToken({
      id,
      sessionId,
      tokenHash,
      status: 'ACTIVE',
      issuedAt,
      expiresAt: sessionExpiresAt,
      consumedAt: null,
      replacedByTokenId: null,
    });
  }

  public static rehydrate(properties: RefreshTokenProperties): RefreshToken {
    return new RefreshToken(properties);
  }

  public consume(successorId: string, now: Date): void {
    if (this.properties.status !== 'ACTIVE' || now >= this.properties.expiresAt) {
      throw new DomainValidationError('REFRESH_NOT_ACTIVE', 'Refresh token is not active');
    }
    this.properties = {
      ...this.properties,
      status: 'CONSUMED',
      consumedAt: now,
      replacedByTokenId: successorId,
    };
  }

  public revoke(): void {
    this.properties = { ...this.properties, status: 'REVOKED' };
  }

  public snapshot(): RefreshTokenProperties {
    return { ...this.properties };
  }
}

