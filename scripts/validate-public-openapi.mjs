import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

/**
 * GW-055 — Validador de deriva (drift) del contrato público del Sprint 1.
 *
 * Verifica, sobre `openapi-public.yaml`, que:
 *  - Están presentes EXACTAMENTE las 7 operaciones públicas (register, login, refresh, validate,
 *    GET/PATCH perfil, GET foto) con su `operationId` estable, y ninguna operación extra.
 *  - Toda operación está documentada: tiene al menos un estado 2xx y cada estado de error (>=400)
 *    se expresa como Problem Details (`application/problem+json`).
 *  - El límite de la foto es el ÚNICO valor decimal 5.000.000 bytes: no aparece ninguna definición
 *    divergente (5 MiB / 5.242.880 / mebibytes).
 *  - No hay secretos en el contrato: ni claves privadas, ni JWT, ni URLs con credenciales, ni correos
 *    de proveedores reales (constitución §V). Un contrato público solo describe formas, nunca valores
 *    sensibles.
 *
 * La comparación 1:1 con los `*.openapi.ts` (register/session/profile) —estados exactos por
 * operación— la hace la suite `test/contract/openapi-drift.spec.ts`, que sí puede importar esas
 * constantes; aquí se valida la consistencia interna y la seguridad del contrato publicado. No se
 * redefine ningún contrato: se reutilizan las salidas de GW-030/042/049/054.
 */

const DEFAULT_CONTRACT = new URL(
  '../specs/001-fundamentos-identidad/contracts/openapi-public.yaml',
  import.meta.url,
);

/** Las 7 operaciones públicas del Sprint 1. El `operationId` es el identificador estable del contrato. */
export const PUBLIC_OPERATIONS = [
  { path: '/auth/register', method: 'post', operationId: 'register' },
  { path: '/auth/login', method: 'post', operationId: 'login' },
  { path: '/auth/refresh', method: 'post', operationId: 'refresh' },
  { path: '/auth/validate', method: 'get', operationId: 'validateAccess' },
  { path: '/users/{userId}/profile', method: 'get', operationId: 'getOwnProfile' },
  { path: '/users/{userId}/profile', method: 'patch', operationId: 'updateOwnProfile' },
  { path: '/users/{userId}/profile/photo', method: 'get', operationId: 'getOwnProfilePhoto' },
];

export const PHOTO_LIMIT_TEXT = '5,000,000';
export const FORBIDDEN_PHOTO_TOKENS = ['5242880', '5,242,880', '5 MiB', '5MiB', '5 mebibyte', 'mebibyte'];

const PROBLEM_MEDIA_TYPE = 'application/problem+json';

/** Métodos HTTP que cuentan como operación; el resto de claves del path item (p. ej. `parameters`) no. */
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/** Patrones que NUNCA deben aparecer en un contrato público. */
const SECRET_RULES = [
  { name: 'clave privada', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'JSON Web Token', pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { name: 'credenciales embebidas en URL', pattern: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/i },
  {
    name: 'correo de proveedor real',
    pattern: /@(?:gmail|googlemail|outlook|hotmail|live|yahoo|ymail|icloud|proton(?:mail)?|aol)\.[a-z.]+/i,
  },
];

export async function loadPublicContract(source = DEFAULT_CONTRACT) {
  const raw = await readFile(source, 'utf8');
  return { raw, document: parse(raw) };
}

/**
 * Devuelve la lista de divergencias encontradas. Vacía ⇒ el contrato es consistente y sin secretos.
 */
export function validatePublicOpenApi(document, raw) {
  const problems = [];

  if (typeof document?.openapi !== 'string' || !document.openapi.startsWith('3.')) {
    problems.push('el documento no declara una versión OpenAPI 3.x');
  }

  validateOperations(document, problems);
  validatePhotoLimit(raw, problems);
  validateNoSecrets(raw, problems);

  return problems;
}

function validateOperations(document, problems) {
  const paths = document?.paths ?? {};

  // No debe existir ninguna operación pública fuera de las 7 declaradas.
  const expected = new Set(PUBLIC_OPERATIONS.map((op) => `${op.method.toUpperCase()} ${op.path}`));
  for (const [path, item] of Object.entries(paths)) {
    for (const method of Object.keys(item ?? {})) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const key = `${method.toUpperCase()} ${path}`;
      if (!expected.has(key)) problems.push(`operación pública inesperada: ${key}`);
    }
  }

  for (const { path, method, operationId } of PUBLIC_OPERATIONS) {
    const label = `${method.toUpperCase()} ${path}`;
    const operation = paths?.[path]?.[method];
    if (operation === undefined) {
      problems.push(`falta la operación ${label}`);
      continue;
    }
    if (operation.operationId !== operationId) {
      problems.push(
        `${label}: operationId "${String(operation.operationId)}" ≠ "${operationId}" esperado`,
      );
    }

    const responses = operation.responses ?? {};
    const statuses = Object.keys(responses);
    if (statuses.length === 0) {
      problems.push(`${label}: no documenta ningún estado de respuesta`);
      continue;
    }
    if (!statuses.some((status) => /^2\d\d$/.test(status))) {
      problems.push(`${label}: no documenta ningún estado de éxito (2xx)`);
    }
    for (const status of statuses) {
      if (Number(status) < 400) continue;
      const resolved = resolveResponse(document, responses[status]);
      if (resolved?.content?.[PROBLEM_MEDIA_TYPE] === undefined) {
        problems.push(`${label}: el estado ${status} no se documenta como Problem Details`);
      }
    }
  }
}

function validatePhotoLimit(raw, problems) {
  if (!raw.includes(PHOTO_LIMIT_TEXT)) {
    problems.push(`el contrato no documenta el límite de foto ${PHOTO_LIMIT_TEXT} bytes`);
  }
  for (const token of FORBIDDEN_PHOTO_TOKENS) {
    if (raw.toLowerCase().includes(token.toLowerCase())) {
      problems.push(`el contrato contiene un límite de foto divergente: "${token}"`);
    }
  }
}

function validateNoSecrets(raw, problems) {
  for (const { name, pattern } of SECRET_RULES) {
    const match = pattern.exec(raw);
    if (match !== null) problems.push(`posible secreto en el contrato (${name}): "${match[0]}"`);
  }
}

function resolveResponse(document, response) {
  if (response !== null && typeof response === 'object' && typeof response.$ref === 'string') {
    return resolvePointer(document, response.$ref);
  }
  return response;
}

function resolvePointer(root, ref) {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, token) => (node === undefined || node === null ? undefined : node[token]), root);
}

async function main() {
  const argument = process.argv[2];
  const source = argument === undefined ? DEFAULT_CONTRACT : pathToFileURL(argument);
  const { raw, document } = await loadPublicContract(source);
  const problems = validatePublicOpenApi(document, raw);
  if (problems.length > 0) {
    process.stderr.write(`Public OpenAPI drift detected:\n- ${problems.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Public OpenAPI is consistent, documents the 7 operations and carries no secrets\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
