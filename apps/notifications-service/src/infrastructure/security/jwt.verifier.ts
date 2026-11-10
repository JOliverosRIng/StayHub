import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { NOTIFICATIONS_CONFIG, type NotificationsConfig } from '../config/notifications-config';
import { Inject } from '@nestjs/common';

export interface AuthenticatedPrincipal {
  sub: string;
  roles: string[];
  tokenType: 'access' | 'service';
  scope?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertNoDuplicateJsonKeys(source: string): void {
  let index = 0;
  const whitespace = (): void => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const parseString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') index += 2;
      else if (source[index++] === '"') break;
    }
    return JSON.parse(source.slice(start, index)) as string;
  };
  const parseValue = (): void => {
    whitespace();
    if (source[index] === '{') {
      index += 1; whitespace();
      const keys = new Set<string>();
      if (source[index] === '}') { index += 1; return; }
      while (index < source.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error('Duplicate JSON key');
        keys.add(key); whitespace(); index += 1; parseValue(); whitespace();
        if (source[index] === '}') { index += 1; return; }
        index += 1;
      }
      throw new Error('Malformed JSON object');
    }
    if (source[index] === '[') {
      index += 1; whitespace();
      if (source[index] === ']') { index += 1; return; }
      while (index < source.length) {
        parseValue(); whitespace();
        if (source[index] === ']') { index += 1; return; }
        index += 1;
      }
      throw new Error('Malformed JSON array');
    }
    if (source[index] === '"') { parseString(); return; }
    while (index < source.length && !/[\s,\]}]/.test(source[index] ?? '')) index += 1;
    if (index === source.length && source.length === 0) throw new Error('Malformed JSON value');
  };
  parseValue(); whitespace();
  if (index !== source.length) throw new Error('Malformed JSON');
}

@Injectable()
export class JwtVerifier {
  constructor(@Inject(NOTIFICATIONS_CONFIG) private readonly config: NotificationsConfig) {}

  verifyAccess(token: string): AuthenticatedPrincipal {
    const payload = this.verify(token, this.config.accessJwt);
    if (!payload.sub || !UUID.test(payload.sub)) throw new UnauthorizedException('Invalid access subject');
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === 'string') : typeof payload.role === 'string' ? [payload.role] : [];
    return { sub: payload.sub, roles, tokenType: 'access' };
  }

  verifyService(token: string): AuthenticatedPrincipal {
    const payload = this.verify(token, this.config.serviceJwt);
    if (typeof payload.scope !== 'string') throw new UnauthorizedException('Invalid service scope');
    if (!payload.scope.split(/\s+/).includes(this.config.sendScope)) throw new ForbiddenException('Insufficient service scope');
    return { sub: typeof payload.sub === 'string' ? payload.sub : 'service', roles: [], tokenType: 'service', scope: payload.scope };
  }

  private verify(token: string, settings: NotificationsConfig['accessJwt']): JwtPayload {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || decoded.header.alg !== 'RS256' || decoded.header.kid !== settings.kid) throw new Error();
      const [headerSegment, payloadSegment] = token.split('.');
      if (!headerSegment || !payloadSegment) throw new Error();
      assertNoDuplicateJsonKeys(Buffer.from(headerSegment, 'base64url').toString('utf8'));
      assertNoDuplicateJsonKeys(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
      const payload = jwt.verify(token, settings.publicKey, {
        algorithms: ['RS256'], issuer: settings.issuer, audience: settings.audience,
        maxAge: settings.maxAgeSeconds, clockTolerance: 0,
      });
      if (typeof payload === 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number') throw new Error();
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
