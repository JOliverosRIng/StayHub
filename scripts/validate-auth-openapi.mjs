import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const CONTRACT_PATH = new URL(
  '../specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml',
  import.meta.url,
);

export const INTERNAL_PATHS = [
  '/internal/v1/registrations',
  '/internal/v1/login',
  '/internal/v1/sessions/refresh',
  '/internal/v1/sessions/validate',
];

export const EXCLUDED_PATHS = ['/health/live', '/health/ready'];

const IGNORED_KEYS = new Set([
  'description',
  'title',
  'summary',
  'tags',
  'example',
  'examples',
  'xml',
  'externalDocs',
  'deprecated',
]);

const SORTED_ARRAY_KEYS = new Set(['enum', 'required']);

export async function loadAuthContract() {
  return parse(await readFile(CONTRACT_PATH, 'utf8'));
}

export function compareAuthOpenApi(document, contract) {
  const differences = [];
  compare('openapi', document?.openapi, contract?.openapi, document, contract, differences);
  compare('info.title', document?.info?.title, contract?.info?.title, document, contract, differences);
  compare(
    'info.version',
    document?.info?.version,
    contract?.info?.version,
    document,
    contract,
    differences,
  );
  compare('servers', document?.servers, contract?.servers, document, contract, differences);
  compare(
    'components.securitySchemes.serviceAuth',
    document?.components?.securitySchemes?.serviceAuth,
    contract?.components?.securitySchemes?.serviceAuth,
    document,
    contract,
    differences,
  );

  const generatedPaths = Object.keys(document?.paths ?? {});
  for (const path of generatedPaths) {
    if (!INTERNAL_PATHS.includes(path)) {
      differences.push(`generated document exposes unexpected path ${path}`);
    }
  }

  const contractPaths = Object.keys(contract?.paths ?? {});
  for (const path of INTERNAL_PATHS) {
    if (!generatedPaths.includes(path)) differences.push(`generated document is missing ${path}`);
    if (!contractPaths.includes(path)) differences.push(`contract is missing ${path}`);
    compareOperation(path, document, contract, differences);
  }

  for (const path of EXCLUDED_PATHS) {
    if (!contractPaths.includes(path)) differences.push(`contract is missing ${path}`);
    if (generatedPaths.includes(path)) {
      differences.push(`generated document should not expose ${path} (excluded by design)`);
    }
  }

  return differences;
}

function compareOperation(path, document, contract, differences) {
  const label = `paths.${path}.post`;
  const generated = document?.paths?.[path]?.post;
  const expected = contract?.paths?.[path]?.post;
  if (generated === undefined) {
    differences.push(`generated document is missing ${label}`);
    return;
  }
  if (expected === undefined) {
    differences.push(`contract is missing ${label}`);
    return;
  }

  compare(`${label}.operationId`, generated.operationId, expected.operationId, document, contract, differences);
  compare(`${label}.security`, generated.security, expected.security, document, contract, differences);
  compare(`${label}.requestBody`, generated.requestBody, expected.requestBody, document, contract, differences);

  compare(
    `${label}.parameters`,
    canonicalParameters(generated.parameters, document),
    canonicalParameters(expected.parameters, contract),
    document,
    contract,
    differences,
  );

  const generatedStatuses = Object.keys(generated.responses ?? {}).sort();
  const expectedStatuses = Object.keys(expected.responses ?? {}).sort();
  compare(`${label}.responses.statuses`, generatedStatuses, expectedStatuses, document, contract, differences);
  for (const status of generatedStatuses) {
    compare(
      `${label}.responses.${status}`,
      generated.responses?.[status],
      expected.responses?.[status],
      document,
      contract,
      differences,
    );
  }
}

function canonicalParameters(parameters, root) {
  const list = Array.isArray(parameters) ? parameters : [];
  return list
    .map((parameter) => canonical(parameter, root))
    .sort((left, right) => stable([left?.in ?? '', left?.name ?? '']) < stable([right?.in ?? '', right?.name ?? '']) ? -1 : 1);
}

function compare(label, generated, expected, document, contract, differences) {
  const left = stable(canonical(generated, document));
  const right = stable(canonical(expected, contract));
  if (left !== right) {
    differences.push(`${label} differs\n  generated: ${left}\n  contract:  ${right}`);
  }
}

function canonical(value, root, seen = new Set()) {
  if (Array.isArray(value)) return value.map((item) => canonical(item, root, seen));
  if (typeof value !== 'object' || value === null) return value;

  if (typeof value.$ref === 'string') {
    if (seen.has(value.$ref)) return { recursive: value.$ref };
    const target = resolvePointer(root, value.$ref);
    if (target === undefined) return { unresolved: value.$ref };
    const nextSeen = new Set(seen);
    nextSeen.add(value.$ref);
    return canonical(target, root, nextSeen);
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (IGNORED_KEYS.has(key)) continue;
    const normalized = canonical(child, root, seen);
    output[key] = SORTED_ARRAY_KEYS.has(key) && Array.isArray(normalized)
      ? [...normalized].sort((a, b) => (stable(a) < stable(b) ? -1 : 1))
      : normalized;
  }
  return output;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
  const jsonPath = process.argv[2];
  if (jsonPath === undefined) {
    process.stderr.write('usage: node scripts/validate-auth-openapi.mjs <generated.json>\n');
    process.exitCode = 2;
    return;
  }
  const document = JSON.parse(await readFile(jsonPath, 'utf8'));
  const contract = await loadAuthContract();
  const differences = compareAuthOpenApi(document, contract);
  if (differences.length > 0) {
    process.stderr.write(`Auth OpenAPI drift detected:\n${differences.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Auth OpenAPI matches the documented contract\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
