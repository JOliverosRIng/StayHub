import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import { DomainError } from '@bookings/domain/shared/domain-error';

function optionalToken(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]?.trim();
  try {
    const token = file ? readFileSync(file, 'utf8').trim() : process.env[name]?.trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function requiredToken(name: string): string {
  const token = optionalToken(name);
  if (!token) throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
  return token;
}

function tokenMap(): Readonly<Record<string, string>> {
  const file = process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE?.trim();
  let raw: string | undefined;
  try {
    raw = (file ? readFileSync(file, 'utf8') : process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON)?.trim();
  } catch {
    throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.some(([key, value]) => !key || typeof value !== 'string')) throw new Error();
    return parsed as Record<string, string>;
  } catch {
    throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
  }
}

@Injectable()
export class EnvironmentServiceTokenProvider implements ServiceTokenPort {
  public getToken(audience: string, scope: string): Promise<string> {
    const dedicated = /notifications/iu.test(audience) ? optionalToken('BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN') : undefined;
    const map = tokenMap();
    const mapped = map[`${audience}:${scope}`] ?? map[audience] ?? map[scope];
    return Promise.resolve(dedicated ?? mapped ?? requiredToken('BOOKINGS_OUTBOUND_SERVICE_TOKEN'));
  }
}
