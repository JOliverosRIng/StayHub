import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { OpenAPIObject } from '@nestjs/swagger';
import { parse } from 'yaml';

import { generateAuthOpenApiDocument } from '../helpers/auth-openapi';

const REPO_ROOT = resolve(__dirname, '../../../..');
const VALIDATOR = resolve(REPO_ROOT, 'scripts/validate-auth-openapi.mjs');
const CONTRACT = resolve(
  REPO_ROOT,
  'specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml',
);

interface ValidatorResult {
  readonly ok: boolean;
  readonly output: string;
}

type Mutation = (document: OpenAPIObject) => void;

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function operation(document: OpenAPIObject, path: string): Record<string, unknown> {
  return record(record(record(document.paths)[path]).post);
}

function schema(document: OpenAPIObject, name: string): Record<string, unknown> {
  return record(record(record(document.components).schemas)[name]);
}

function property(
  document: OpenAPIObject,
  schemaName: string,
  propertyName: string,
): Record<string, unknown> {
  return record(record(schema(document, schemaName).properties)[propertyName]);
}

function clone(document: OpenAPIObject): OpenAPIObject {
  return JSON.parse(JSON.stringify(document)) as OpenAPIObject;
}

function runValidator(document: unknown): ValidatorResult {
  const directory = mkdtempSync(join(tmpdir(), 'auth-openapi-drift-'));
  const file = join(directory, 'generated.json');
  writeFileSync(file, JSON.stringify(document));
  try {
    const output = execFileSync(process.execPath, [VALIDATOR, file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const MUTATIONS: ReadonlyArray<readonly [string, Mutation]> = [
  [
    'a missing response guard',
    (document): void => {
      delete record(operation(document, '/internal/v1/registrations').responses)['401'];
    },
  ],
  [
    'an ADMIN role allowed in registration',
    (document): void => {
      (property(document, 'RegisterCommand', 'role').enum as unknown[]).push('ADMIN');
    },
  ],
  [
    'a required field dropped from a request',
    (document): void => {
      schema(document, 'RegisterCommand').required = ['name', 'password', 'role'];
    },
  ],
  [
    'a changed token lifetime',
    (document): void => {
      property(document, 'InternalTokenPair', 'expiresIn').enum = [1800];
    },
  ],
  [
    'missing service authentication',
    (document): void => {
      operation(document, '/internal/v1/login').security = [];
    },
  ],
  [
    'an extra functional path',
    (document): void => {
      record(document.paths)['/internal/v1/extra'] = { post: { responses: {} } };
    },
  ],
  [
    'an idempotency header without UUID format',
    (document): void => {
      const parameters = operation(document, '/internal/v1/registrations').parameters as Array<
        Record<string, unknown>
      >;
      delete record(parameters[0]?.schema).format;
    },
  ],
  [
    'a downgraded OpenAPI version',
    (document): void => {
      document.openapi = '3.0.0';
    },
  ],
];

describe('Auth OpenAPI drift (AUTH-075)', () => {
  let base: OpenAPIObject;

  beforeAll(async () => {
    const generated = await generateAuthOpenApiDocument();
    base = generated.document;
    await generated.close();
  });

  it('matches the documented contract without drift', () => {
    const result = runValidator(base);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('matches');
  });

  it.each(MUTATIONS)('rejects drift caused by %s', (_name, mutate) => {
    const mutated = clone(base);
    mutate(mutated);
    const result = runValidator(mutated);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('drift');
  });

  it('treats documented health routes as an explicit exclusion', () => {
    const contract = parse(readFileSync(CONTRACT, 'utf8')) as unknown;
    const contractPaths = record(record(contract).paths);
    expect(contractPaths['/health/live']).toBeDefined();
    expect(contractPaths['/health/ready']).toBeDefined();
    expect(record(base.paths)['/health/live']).toBeUndefined();
    expect(record(base.paths)['/health/ready']).toBeUndefined();
  });

  it('keeps generated documents in a temporary location, not the repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'auth-openapi-drift-'));
    try {
      expect(directory.startsWith(tmpdir())).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
