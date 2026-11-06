import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export const CONTRACT_PATH = resolve(__dirname, '../../../../specs/002-alojamientos/contracts/openapi-accommodations-service.yaml');

type Node = Record<string, unknown>;
interface Operation { operationId: string; requestBody?: Node; responses: Record<string, Node>; security?: unknown[] }
export interface ContractDocument { paths: Record<string, Record<string, unknown>>; components: Node }

export const contract = parse(readFileSync(CONTRACT_PATH, 'utf8')) as ContractDocument;
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function deref(node: Node): Node {
  const ref = node.$ref;
  if (typeof ref !== 'string') return node;
  const target = ref.replace(/^#\//, '').split('/').reduce<unknown>((current, key) => (current as Node)[key], contract);
  return deref(target as Node);
}

export function operations(): { method: string; path: string; operation: Operation }[] {
  return Object.entries(contract.paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => method in item).map((method) => ({ method, path, operation: item[method] as Operation })));
}

function operation(operationId: string): Operation {
  const found = operations().find((entry) => entry.operation.operationId === operationId);
  if (!found) throw new Error(`Unknown operationId ${operationId}`);
  return found.operation;
}

export function requestSchema(operationId: string, contentType = 'application/json'): Node {
  const body = deref(operation(operationId).requestBody ?? {});
  const content = (body.content as Record<string, { schema: Node }> | undefined)?.[contentType];
  if (!content) throw new Error(`${operationId} has no ${contentType} request body`);
  return content.schema;
}

export function documentedStatuses(operationId: string): number[] {
  return Object.keys(operation(operationId).responses).map(Number);
}

function responseFor(operationId: string, status: number): { contentType: string; schema: Node } | undefined {
  const raw = operation(operationId).responses[String(status)];
  if (!raw) return undefined;
  const content = deref(raw).content as Record<string, { schema: Node }>;
  const [contentType, media] = Object.entries(content)[0] ?? [];
  return contentType && media ? { contentType, schema: media.schema } : undefined;
}

/** Minimal OpenAPI 3.0 schema validator for the keywords used by this contract; returns JSON-path style violations. */
export function validate(schemaNode: Node, value: unknown, path = '$'): string[] {
  const schema = deref(schemaNode);
  if (value === null) return schema.nullable === true ? [] : [`${path}: null not allowed`];
  const errors: string[] = [];
  for (const part of (schema.allOf as Node[] | undefined) ?? []) errors.push(...validate(part, value, path));
  if (schema.not && validate(schema.not as Node, value, path).length === 0) errors.push(`${path}: matches forbidden schema`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path}: not in enum`);
  const inferred = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : undefined;
  switch (schema.type ?? inferred) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return [...errors, `${path}: expected object`];
      const record = value as Node; const properties = (schema.properties as Record<string, Node> | undefined) ?? {};
      for (const key of (schema.required as string[] | undefined) ?? []) if (!(key in record)) errors.push(`${path}.${key}: required`);
      for (const [key, item] of Object.entries(record)) {
        if (properties[key]) errors.push(...validate(properties[key], item, `${path}.${key}`));
        else if (schema.additionalProperties === false) errors.push(`${path}.${key}: additional property`);
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) return [...errors, `${path}: expected array`];
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: minItems`);
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
      if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: uniqueItems`);
      value.forEach((item, index) => errors.push(...validate(schema.items as Node, item, `${path}[${index}]`)));
      break;
    }
    case 'string': {
      if (typeof value !== 'string') return [...errors, `${path}: expected string`];
      const length = [...value].length;
      if (typeof schema.minLength === 'number' && length < schema.minLength) errors.push(`${path}: minLength`);
      if (typeof schema.maxLength === 'number' && length > schema.maxLength) errors.push(`${path}: maxLength`);
      if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
      if (schema.format === 'uuid' && !UUID.test(value)) errors.push(`${path}: format uuid`);
      if (schema.format === 'date-time' && (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value)))) errors.push(`${path}: format date-time`);
      break;
    }
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || (schema.type === 'integer' && !Number.isInteger(value))) return [...errors, `${path}: expected ${String(schema.type)}`];
      if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: minimum`);
      if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: maximum`);
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
      break;
    default:
      break;
  }
  return errors;
}

/** Asserts that status, Content-Type and body of a real response are documented by the operation. */
export function expectContract(res: { status: number; headers: Record<string, string>; body: unknown }, operationId: string): void {
  const documented = responseFor(operationId, res.status);
  expect({ operationId, status: res.status, documented: documented !== undefined }).toEqual({ operationId, status: res.status, documented: true });
  if (!documented) return;
  expect(res.headers['content-type']).toContain(documented.contentType);
  expect(validate(documented.schema, res.body)).toEqual([]);
}
