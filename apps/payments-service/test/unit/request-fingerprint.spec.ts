import { createHash } from 'node:crypto';
import { canonicalJson, requestFingerprint } from '../../src/infrastructure/security/request-fingerprint';

describe('request fingerprint', () => {
  it('serializes object keys in sorted order recursively', () => {
    expect(canonicalJson({ z: 1, nested: { b: true, a: 'x' }, a: [2, 1] }))
      .toBe('{"a":[2,1],"nested":{"a":"x","b":true},"z":1}');
  });

  it('produces the SHA-256 fingerprint of the canonical JSON', () => {
    const request = { b: 2, a: 1 };
    expect(requestFingerprint(request)).toBe(
      createHash('sha256').update('{"a":1,"b":2}', 'utf8').digest('hex'),
    );
    expect(requestFingerprint(request)).toBe(requestFingerprint({ a: 1, b: 2 }));
  });

  it('preserves array order and rejects values that are not JSON-safe', () => {
    expect(requestFingerprint([1, 2])).not.toBe(requestFingerprint([2, 1]));
    expect(() => canonicalJson({ invalid: undefined })).toThrow();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow();
    expect(() => canonicalJson({ value: Number.NaN })).toThrow();
  });
});
