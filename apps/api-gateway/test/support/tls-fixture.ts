import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

export interface TlsFixture {
  readonly certPem: string;
  readonly keyPem: string;
}

const TAG = {
  bitString: 0x03,
  integer: 0x02,
  octetString: 0x04,
  oid: 0x06,
  sequence: 0x30,
  set: 0x31,
  utcTime: 0x17,
  utf8String: 0x0c,
} as const;

const CURVE = {
  name: 'prime256v1',
  oid: '1.2.840.10045.3.1.7',
} as const;

const OID = {
  commonName: '2.5.4.3',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  idEcPublicKey: '1.2.840.10045.2.1',
  subjectAltName: '2.5.29.17',
} as const;

function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  const octets: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    octets.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return Buffer.from([0x80 | octets.length, ...octets]);
}

function der(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}

const sequence = (...parts: Buffer[]): Buffer => der(TAG.sequence, Buffer.concat(parts));
const set = (...parts: Buffer[]): Buffer => der(TAG.set, Buffer.concat(parts));

function integer(bytes: Buffer): Buffer {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }
  let value = bytes.subarray(start);
  if ((value[0] ?? 0) & 0x80) {
    value = Buffer.concat([Buffer.from([0]), value]);
  }
  return der(TAG.integer, value);
}

const bitString = (content: Buffer): Buffer =>
  der(TAG.bitString, Buffer.concat([Buffer.from([0]), content]));

const octetString = (content: Buffer): Buffer => der(TAG.octetString, content);

const utf8String = (value: string): Buffer => der(TAG.utf8String, Buffer.from(value, 'utf8'));

const contextConstructed = (index: number, content: Buffer): Buffer => der(0xa0 | index, content);

const contextPrimitive = (index: number, content: Buffer): Buffer => der(0x80 | index, content);

function encodeOid(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const first = parts[0];
  const second = parts[1];
  if (first === undefined || second === undefined) {
    throw new Error(`Invalid OID: ${oid}`);
  }
  const octets: number[] = [first * 40 + second];
  for (const part of parts.slice(2)) {
    const chunk: number[] = [];
    let remaining = part;
    do {
      chunk.unshift(remaining & 0x7f);
      remaining = Math.floor(remaining / 128);
    } while (remaining > 0);
    for (let index = 0; index < chunk.length - 1; index += 1) {
      chunk[index] = (chunk[index] ?? 0) | 0x80;
    }
    octets.push(...chunk);
  }
  return Buffer.from(octets);
}

const oid = (value: string): Buffer => der(TAG.oid, encodeOid(value));

function utcTime(date: Date): Buffer {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const year = date.getUTCFullYear() % 100;
  const stamp = [
    pad(year),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
  return der(TAG.utcTime, Buffer.from(`${stamp}Z`, 'ascii'));
}

function distinguishedName(commonName: string): Buffer {
  return sequence(set(sequence(oid(OID.commonName), utf8String(commonName))));
}

function subjectAltName(commonName: string): Buffer {
  const names = sequence(contextPrimitive(2, Buffer.from(commonName, 'ascii')));
  const extension = sequence(oid(OID.subjectAltName), octetString(names));
  return contextConstructed(3, sequence(extension));
}

function rawEcdsaSignature(signature: Buffer): Buffer {
  const half = signature.length / 2;
  return sequence(
    integer(signature.subarray(0, half)),
    integer(signature.subarray(half)),
  );
}

function publicPoint(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: 'jwk' });
  if (jwk.x === undefined || jwk.y === undefined) {
    throw new Error('EC public key export is missing coordinates');
  }
  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
}

export function createSelfSignedTlsFixture(commonName = 'localhost'): TlsFixture {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: CURVE.name });
  const algorithm = sequence(oid(OID.ecdsaWithSha256));
  const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const tbs = sequence(
    contextConstructed(0, integer(Buffer.from([2]))),
    integer(Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])),
    algorithm,
    distinguishedName(commonName),
    sequence(utcTime(notBefore), utcTime(notAfter)),
    distinguishedName(commonName),
    sequence(sequence(oid(OID.idEcPublicKey), oid(CURVE.oid)), bitString(publicPoint(publicKey))),
    subjectAltName(commonName),
  );
  const signature = rawEcdsaSignature(
    sign('sha256', tbs, { key: privateKey, dsaEncoding: 'ieee-p1363' }),
  );
  const certificate = sequence(tbs, algorithm, bitString(signature));
  return {
    certPem: `-----BEGIN CERTIFICATE-----\n${certificate.toString('base64')}\n-----END CERTIFICATE-----\n`,
    keyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}
