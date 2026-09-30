import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parse, stringify } from 'yaml';

import {
  REGISTER_OPERATION_ID,
  REGISTER_RESPONSE_CODES,
} from '@gateway/interfaces/openapi/register.openapi';
import {
  LOGIN_OPERATION_ID,
  LOGIN_RESPONSE_CODES,
  REFRESH_OPERATION_ID,
  REFRESH_RESPONSE_CODES,
  VALIDATE_OPERATION_ID,
  VALIDATE_RESPONSE_CODES,
} from '@gateway/interfaces/openapi/session.openapi';
import {
  GET_PHOTO_OPERATION_ID,
  GET_PHOTO_RESPONSE_CODES,
  GET_PROFILE_OPERATION_ID,
  GET_PROFILE_RESPONSE_CODES,
  PHOTO_MAX_BYTES,
  PHOTO_MEBIBYTES,
  UPDATE_PROFILE_OPERATION_ID,
  UPDATE_PROFILE_RESPONSE_CODES,
} from '@gateway/interfaces/openapi/profile.openapi';

/**
 * GW-055 — Deriva del contrato público (constitución §V seguridad, §VII contratos).
 *
 * Comprueba que `openapi-public.yaml` y los `*.openapi.ts` (register/session/profile) coinciden 1:1
 * para las 7 operaciones del Sprint 1, que cada estado de error es Problem Details, que el límite de
 * la foto es el único valor decimal 5.000.000 y que no hay secretos. Además ejerce el validador
 * `scripts/validate-public-openapi.mjs`: aprueba el contrato publicado y FALLA ante cualquier
 * divergencia introducida (operación ausente, operationId cambiado, error sin Problem Details,
 * límite de foto divergente o secreto inyectado). No redefine contratos: reutiliza las constantes
 * exportadas por GW-030/042/049.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');
const VALIDATOR = resolve(REPO_ROOT, 'scripts/validate-public-openapi.mjs');
const CONTRACT = resolve(
  REPO_ROOT,
  'specs/001-fundamentos-identidad/contracts/openapi-public.yaml',
);

const RAW = readFileSync(CONTRACT, 'utf8');

interface OperationView {
  readonly operationId?: string;
  readonly responses?: Record<string, unknown>;
}

interface DocView {
  readonly paths: Record<string, Record<string, OperationView>>;
  readonly components: { readonly responses: Record<string, ResponseView> };
}

interface ResponseView {
  readonly content?: Record<string, unknown>;
}

const doc = parse(RAW) as DocView;

interface ExpectedOperation {
  readonly path: string;
  readonly method: 'get' | 'post' | 'patch';
  readonly operationId: string;
  readonly codes: readonly number[];
}

const EXPECTED: readonly ExpectedOperation[] = [
  { path: '/auth/register', method: 'post', operationId: REGISTER_OPERATION_ID, codes: REGISTER_RESPONSE_CODES },
  { path: '/auth/login', method: 'post', operationId: LOGIN_OPERATION_ID, codes: LOGIN_RESPONSE_CODES },
  { path: '/auth/refresh', method: 'post', operationId: REFRESH_OPERATION_ID, codes: REFRESH_RESPONSE_CODES },
  { path: '/auth/validate', method: 'get', operationId: VALIDATE_OPERATION_ID, codes: VALIDATE_RESPONSE_CODES },
  {
    path: '/users/{userId}/profile',
    method: 'get',
    operationId: GET_PROFILE_OPERATION_ID,
    codes: GET_PROFILE_RESPONSE_CODES,
  },
  {
    path: '/users/{userId}/profile',
    method: 'patch',
    operationId: UPDATE_PROFILE_OPERATION_ID,
    codes: UPDATE_PROFILE_RESPONSE_CODES,
  },
  {
    path: '/users/{userId}/profile/photo',
    method: 'get',
    operationId: GET_PHOTO_OPERATION_ID,
    codes: GET_PHOTO_RESPONSE_CODES,
  },
];

function operationOf(document: DocView, op: ExpectedOperation): OperationView | undefined {
  return document.paths?.[op.path]?.[op.method];
}

function resolvedResponse(document: DocView, response: unknown): ResponseView | undefined {
  if (response !== null && typeof response === 'object' && '$ref' in response) {
    const ref = String((response as { $ref: string }).$ref);
    const name = ref.split('/').pop() ?? '';
    return document.components?.responses?.[name];
  }
  return response as ResponseView | undefined;
}

interface ValidatorResult {
  readonly ok: boolean;
  readonly output: string;
}

function runValidator(rawYaml: string): ValidatorResult {
  const directory = mkdtempSync(join(tmpdir(), 'public-openapi-drift-'));
  const file = join(directory, 'openapi-public.yaml');
  writeFileSync(file, rawYaml);
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

/** Reescribe el contrato aplicando una mutación sobre el objeto parseado. */
function mutated(mutate: (document: Record<string, unknown>) => void): string {
  const clone = parse(RAW) as Record<string, unknown>;
  mutate(clone);
  return stringify(clone);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('Deriva del contrato público (GW-055)', () => {
  it('el validador aprueba el contrato publicado', () => {
    const result = runValidator(RAW);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('7 operations');
  });

  it('están presentes exactamente las 7 operaciones del Sprint 1', () => {
    const present = EXPECTED.filter((op) => operationOf(doc, op) !== undefined);
    expect(present).toHaveLength(7);
  });

  describe('cada operación coincide 1:1 con su *.openapi.ts', () => {
    it.each(EXPECTED)('$method $path documenta operationId y estados', (op) => {
      const operation = operationOf(doc, op);
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBe(op.operationId);

      const statuses = Object.keys(operation?.responses ?? {})
        .map(Number)
        .sort((a, b) => a - b);
      expect(statuses).toEqual([...op.codes].sort((a, b) => a - b));
    });

    it.each(EXPECTED)('$method $path expresa sus errores como Problem Details', (op) => {
      const operation = operationOf(doc, op);
      const responses = operation?.responses ?? {};
      for (const status of Object.keys(responses)) {
        if (Number(status) < 400) continue;
        const resolved = resolvedResponse(doc, responses[status]);
        expect(resolved?.content?.['application/problem+json']).toBeDefined();
      }
    });
  });

  it('el límite de foto es el único valor decimal 5.000.000 bytes (nunca 5 MiB)', () => {
    expect(PHOTO_MAX_BYTES).toBe(5_000_000);
    expect(PHOTO_MAX_BYTES).not.toBe(PHOTO_MEBIBYTES);
    expect(RAW).toContain('5,000,000');
    for (const forbidden of ['5242880', '5,242,880', '5 MiB', 'mebibyte']) {
      expect(RAW.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('el contrato no contiene secretos', () => {
    const secrets = [
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
      /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
      /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/i,
      /@(?:gmail|googlemail|outlook|hotmail|live|yahoo|ymail|icloud|proton(?:mail)?|aol)\.[a-z.]+/i,
    ];
    for (const pattern of secrets) {
      expect(pattern.test(RAW)).toBe(false);
    }
  });

  describe('el validador FALLA ante cualquier divergencia', () => {
    it('operación ausente', () => {
      const raw = mutated((document) => {
        delete asRecord(asRecord(document['paths'])['/auth/login'])['post'];
      });
      expect(runValidator(raw).ok).toBe(false);
    });

    it('operationId cambiado', () => {
      const raw = mutated((document) => {
        asRecord(asRecord(asRecord(document['paths'])['/auth/register'])['post'])['operationId'] =
          'registerV2';
      });
      expect(runValidator(raw).ok).toBe(false);
    });

    it('estado de error sin Problem Details', () => {
      const raw = mutated((document) => {
        asRecord(asRecord(asRecord(document['components'])['responses'])['Unauthorized'])['content'] =
          {};
      });
      expect(runValidator(raw).ok).toBe(false);
    });

    it('límite de foto divergente (5 MiB)', () => {
      const raw = RAW.replace('5,000,000 bytes (5 MB decimal)', '5,242,880 bytes (5 MiB)');
      expect(raw).not.toBe(RAW);
      expect(runValidator(raw).ok).toBe(false);
    });

    it('secreto inyectado en una descripción', () => {
      const raw = RAW.replace(
        'openapi: 3.0.3',
        'openapi: 3.0.3\n# contacto de soporte: soporte.stayhub@gmail.com',
      );
      expect(raw).not.toBe(RAW);
      expect(runValidator(raw).ok).toBe(false);
    });
  });
});
