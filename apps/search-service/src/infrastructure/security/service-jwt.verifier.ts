import { Inject, Injectable } from '@nestjs/common';
import { importSPKI, jwtVerify, type JWTPayload } from 'jose';
import { SEARCH_CONFIG } from '../config/config.module';
import type { SearchConfig } from '../config/search-config';
import { SearchApplicationError } from '@search/application/errors/search-errors';

@Injectable()
export class ServiceJwtVerifier {
  public constructor(@Inject(SEARCH_CONFIG) private readonly config: SearchConfig) {}
  public async verify(token: string): Promise<JWTPayload> {
    const [encodedHeader] = token.split('.');
    if (!encodedHeader) throw this.unauthenticated();
    let header: { kid?: string; alg?: string };
    try { header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { kid?: string; alg?: string }; } catch { throw this.unauthenticated(); }
    if (header.alg !== 'RS256' || !header.kid) throw this.unauthenticated();
    const pem = this.config.jwtPublicKeys[header.kid];
    if (!pem) throw this.unauthenticated();
    try {
      const key = await importSPKI(pem.replaceAll('\\n', '\n'), 'RS256');
      const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'], issuer: this.config.jwtIssuer, audience: this.config.jwtAudience, clockTolerance: 5 });
      const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/u) : [];
      if (!scopes.includes(this.config.jwtScope)) throw new SearchApplicationError('SEARCH_FORBIDDEN', 'Service scope is insufficient.', 403);
      return payload;
    } catch (error) {
      if (error instanceof SearchApplicationError) throw error;
      throw this.unauthenticated();
    }
  }
  private unauthenticated(): SearchApplicationError { return new SearchApplicationError('SEARCH_UNAUTHENTICATED', 'A valid service token is required.', 401); }
}
