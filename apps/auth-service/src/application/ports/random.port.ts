export const UUID_GENERATOR = Symbol('UUID_GENERATOR');
export const ENTROPY_GENERATOR = Symbol('ENTROPY_GENERATOR');

export interface UuidGenerator {
  generate(): string;
}

export interface EntropyGenerator {
  generate(bytes: number): Uint8Array;
}

