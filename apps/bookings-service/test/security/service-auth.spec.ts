import { createSecretKey } from 'node:crypto';
import { exportSPKI, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { ServiceAuthGuard } from '@bookings/interfaces/http/guards/service-auth.guard';

describe('service JWT',()=>{
  let privateKey:KeyLike;let verifier:ServiceJwtVerifier;
  beforeAll(async()=>{const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;verifier=new ServiceJwtVerifier({jwtPublicKeys:{k1:await exportSPKI(pair.publicKey)},jwtIssuer:'auth',jwtAudience:'bookings',jwtScope:'bookings:write'} as never);});
  const token=async(options:{kid?:string;issuer?:string;audience?:string;scope?:string;issuedAt?:number;expiration?:number}={}):Promise<string>=>new SignJWT({scope:options.scope??'bookings:write',role:'GUEST'}).setProtectedHeader({alg:'RS256',kid:options.kid??'k1'}).setIssuer(options.issuer??'auth').setAudience(options.audience??'bookings').setSubject('trusted-guest').setIssuedAt(options.issuedAt??Math.floor(Date.now()/1000)).setExpirationTime(options.expiration??Math.floor(Date.now()/1000)+120).sign(privateKey);
  it('accepts configured RS256 claims',async()=>await expect(verifier.verify(await token())).resolves.toMatchObject({sub:'trusted-guest',role:'GUEST'}));
  it.each([{kid:'unknown'},{issuer:'other'},{audience:'other'},{scope:'other'},{issuedAt:Math.floor(Date.now()/1000)+3600},{expiration:Math.floor(Date.now()/1000)-60}])('rejects adversarial claims %#',async(options)=>await expect(verifier.verify(await token(options))).rejects.toThrow());
  it('rejects a different algorithm',async()=>{const value=await new SignJWT({scope:'bookings:write'}).setProtectedHeader({alg:'HS256',kid:'k1'}).setIssuer('auth').setAudience('bookings').setSubject('guest').setIssuedAt().setExpirationTime('2m').sign(createSecretKey(Buffer.alloc(32,1)));await expect(verifier.verify(value)).rejects.toThrow();});
  it('ignores spoofed identity headers and trusts the verified subject',async()=>{const request={headers:{authorization:`Bearer ${await token()}`,'x-stayhub-user-id':'attacker'}};const guard=new ServiceAuthGuard(verifier);const context={switchToHttp:()=>({getRequest:()=>request})};await expect(guard.canActivate(context as never)).resolves.toBe(true);expect((request as {principal?:{sub:string}}).principal?.sub).toBe('trusted-guest');});
});
