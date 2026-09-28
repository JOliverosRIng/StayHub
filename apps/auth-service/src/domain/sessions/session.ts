import { DomainValidationError } from '@auth/domain/shared/domain-error';

export type SessionRole = 'GUEST' | 'OWNER' | 'ADMIN';

export interface SessionProperties {
  readonly id: string;
  readonly userId: string;
  readonly role: SessionRole;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly version: number;
}

export class Session {
  private constructor(private properties: SessionProperties) {}

  public static create(
    id: string,
    userId: string,
    role: SessionRole,
    now: Date,
    absoluteTtlSeconds = 604800,
  ): Session {
    if (absoluteTtlSeconds !== 604800) {
      throw new DomainValidationError('INVALID_SESSION_TTL', 'Session lifetime must be seven days');
    }
    return new Session({
      id,
      userId,
      role,
      absoluteExpiresAt: new Date(now.getTime() + absoluteTtlSeconds * 1000),
      revokedAt: null,
      createdAt: now,
      version: 1,
    });
  }

  public static rehydrate(properties: SessionProperties): Session {
    return new Session(properties);
  }

  public isActive(now: Date): boolean {
    return this.properties.revokedAt === null && now < this.properties.absoluteExpiresAt;
  }

  public revoke(now: Date): void {
    if (this.properties.revokedAt !== null) return;
    this.properties = { ...this.properties, revokedAt: now, version: this.properties.version + 1 };
  }

  public snapshot(): SessionProperties {
    return { ...this.properties };
  }
}

