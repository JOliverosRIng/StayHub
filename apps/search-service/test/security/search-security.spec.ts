import { ServiceJwtVerifier } from '../../src/infrastructure/security/service-jwt.verifier';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import { createServiceJwtFixture } from '../helpers/service-jwt.fixture';
describe('search service JWT', () => {
  it('accepts only the configured issuer, audience, kid and scope', async () => {
    const fixture = await createServiceJwtFixture();
    const config = { jwtPublicKeys: { 'test-key': fixture.publicKey }, jwtIssuer: 'stayhub-api-gateway', jwtAudience: 'stayhub-search-service', jwtScope: 'search:invoke' } as unknown as SearchConfig;
    const verifier = new ServiceJwtVerifier(config);
    await expect(verifier.verify(await fixture.token())).resolves.toEqual(expect.objectContaining({ scope: 'search:invoke' }));
    await expect(verifier.verify(await fixture.token({ scope: 'other' }))).rejects.toEqual(expect.objectContaining({ status: 403 }));
    await expect(verifier.verify(await fixture.token({ audience: 'other' }))).rejects.toEqual(expect.objectContaining({ status: 401 }));
  });
  it('rejects malformed tokens without leaking verification details', async () => {
    const verifier = new ServiceJwtVerifier({ jwtPublicKeys: {}, jwtIssuer: 'issuer', jwtAudience: 'audience', jwtScope: 'scope' } as unknown as SearchConfig);
    await expect(verifier.verify('not-a-jwt')).rejects.toEqual(expect.objectContaining({ code: 'SEARCH_UNAUTHENTICATED', status: 401 }));
  });
});
