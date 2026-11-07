import { randomUUID } from 'node:crypto';
export const ID_GENERATOR_PORT = Symbol('ID_GENERATOR_PORT');
export interface IdGeneratorPort { generate(): string; }
export class UuidGenerator implements IdGeneratorPort { public generate(): string { return randomUUID(); } }
