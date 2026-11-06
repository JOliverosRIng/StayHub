import { randomUUID } from 'node:crypto';

export interface IdGeneratorPort { generate(): string; }
export const ID_GENERATOR_PORT = Symbol('ID_GENERATOR_PORT');
export class UuidGenerator implements IdGeneratorPort { public generate(): string { return randomUUID(); } }
