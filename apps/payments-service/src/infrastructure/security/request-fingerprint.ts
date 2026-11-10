import { createHash } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';

function invalidJson(reason: string): never {
  throw new DomainError('VALIDATION_ERROR', `Request cannot be fingerprinted: ${reason}`);
}

function serialize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidJson('numbers must be finite');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') invalidJson('value is not JSON-compatible');
  if (ancestors.has(value)) invalidJson('cyclic values are not supported');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) invalidJson('sparse arrays are not supported');
        entries.push(serialize(value[index], ancestors));
      }
      return `[${entries.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) invalidJson('only plain objects are supported');
    if (Object.getOwnPropertySymbols(value).length > 0) invalidJson('symbol keys are not supported');

    const fields = Object.keys(value).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) invalidJson('accessor properties are not supported');
      const fieldValue = descriptor.value as unknown;
      return `${JSON.stringify(key)}:${serialize(fieldValue, ancestors)}`;
    });
    return `{${fields.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Deterministic JSON serialization with lexicographically sorted object keys. */
export function canonicalJson(value: unknown): string {
  return serialize(value, new WeakSet<object>());
}

/** SHA-256 hex digest of a request's canonical JSON representation. */
export function requestFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
