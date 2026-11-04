import { exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from 'jose';
export async function createServiceJwtFixture(): Promise<{ publicKey: string; privateKey: string; token: (overrides?: { scope?: string; issuer?: string; audience?: string }) => Promise<string> }> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const publicPem = await exportSPKI(publicKey); const privatePem = await exportPKCS8(privateKey);
  return { publicKey: publicPem, privateKey: privatePem, token: async (overrides = {}) => new SignJWT({ scope: overrides.scope ?? 'search:invoke' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(overrides.issuer ?? 'stayhub-api-gateway').setAudience(overrides.audience ?? 'stayhub-search-service').setIssuedAt().setExpirationTime('2m').sign(privateKey) };
}
