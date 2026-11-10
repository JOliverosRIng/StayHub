import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import { DomainError } from '@bookings/domain/shared/domain-error';

@Injectable()
export class EnvironmentServiceTokenProvider implements ServiceTokenPort {
  public getToken(): Promise<string> { const file = process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN_FILE?.trim(); const token = file ? readFileSync(file, 'utf8').trim() : process.env.BOOKINGS_OUTBOUND_SERVICE_TOKEN?.trim(); if (!token) throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE'); return Promise.resolve(token); }
}
