import type { Registration } from '@auth/domain/registrations/registration';
import type { CredentialRepository, RegistrationRepository } from './repositories.port';

export const REGISTRATION_WORK = Symbol('REGISTRATION_WORK');

export const REGISTRATION_LEASE_SECONDS = 120;

export interface RegistrationWorkContext {
  readonly registrations: RegistrationRepository;
  readonly credentials: CredentialRepository;
}

export type RegistrationClaimOneResult =
  | { readonly status: 'claimed'; readonly registration: Registration }
  | { readonly status: 'busy' }
  | { readonly status: 'terminal'; readonly registration: Registration }
  | { readonly status: 'missing' };

export interface RegistrationWorkPort {
  createOrRead(registration: Registration): Promise<Registration>;
  claimOne(
    id: string,
    owner: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<RegistrationClaimOneResult>;
  claimBatch(
    owner: string,
    now: Date,
    limit: number,
    leaseUntil: Date,
  ): Promise<readonly Registration[]>;
  renew(id: string, owner: string, now: Date, leaseUntil: Date): Promise<Registration | null>;
  release(id: string, owner: string, now: Date): Promise<boolean>;
  transaction<T>(work: (context: RegistrationWorkContext) => Promise<T>): Promise<T>;
}
