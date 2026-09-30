import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly dummyHash: Promise<string>;

  public constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
    this.dummyHash = this.hash('stayhub-dummy-password-not-a-real-credential');
  }

  public hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.config.argon2.memoryCost,
      timeCost: this.config.argon2.timeCost,
      parallelism: this.config.argon2.parallelism,
    });
  }

  public async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  public async verifyWithEquivalentCost(hash: string | null, password: string): Promise<boolean> {
    return this.verify(hash ?? (await this.dummyHash), password);
  }
}
