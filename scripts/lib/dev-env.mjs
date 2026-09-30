// Configuración de desarrollo compartida por Auth y Users (integración Auth<->Users).
//
// Fuente única de verdad del entorno de desarrollo local: `.env` en la raíz y los
// archivos de secretos públicos que Compose monta en Users. Se reutiliza entre
// reinicios y entre ambos modos de arranque (nativo y contenedores) para no rotar
// claves ni romper tokens de registro. No contiene claves privadas de Users.
import { createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// Correspondencia obligatoria B1 entre Auth y Users.
export const ACCESS_KID = 'stayhub-auth-2026-01';
export const OUTBOUND_KID = 'auth-users-2026-01';
export const INBOUND_KID = 'gateway-dev-2026-01';
export const AUTH_JWT_ISSUER = 'https://auth.stayhub.internal';
export const AUTH_JWT_AUDIENCE = 'stayhub-api';
export const OUTBOUND_ISSUER = 'stayhub-auth-service';
export const OUTBOUND_AUDIENCE = 'stayhub-users-service';
export const OUTBOUND_SCOPE = 'users:registration users:login-identity';
export const REGISTRATION_SCOPE = 'users:registration';
export const LOOKUP_SCOPE = 'users:login-identity';
export const INBOUND_ISSUER = 'stayhub-dev-gateway';
export const INBOUND_AUDIENCE = 'stayhub-auth-service-dev';
export const INBOUND_SCOPE = 'auth:invoke';

// Rutas (relativas a la raíz) de los archivos de secretos requeridos por Compose.
export const SECRET_FILES = {
  accessPublic: 'access-public.pem',
  servicePublic: 'service-public.pem',
  gatewayPublic: 'gateway-public.pem',
  gatewayPrivate: 'gateway-private.pem',
  usersDbPassword: 'users-db-password.txt',
  usersDatabaseUrl: 'users-database-url.txt',
};

export class DevEnvConflictError extends Error {
  constructor(conflicts) {
    super(`Configuración de desarrollo incoherente: ${conflicts.join('; ')}`);
    this.name = 'DevEnvConflictError';
    this.conflicts = conflicts;
  }
}

export function rsaPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

export function secret() {
  return randomBytes(48).toString('base64url');
}

export function derivePublicKey(privateKey) {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
}

export function envValue(value) {
  return String(value).replace(/\n/g, '\\n');
}

export function parseEnv(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function unescapeValue(value) {
  return value.replace(/\\n/g, '\n');
}

function writeSecretFile(path, contents) {
  writeFileSync(path, contents.endsWith('\n') ? contents : `${contents}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return path;
}

function readSecretFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function writeUsersSecretFiles(secretsDir, { accessPublic, servicePublic, dbPassword, databaseUrl }) {
  return {
    accessPublic: writeSecretFile(join(secretsDir, SECRET_FILES.accessPublic), accessPublic),
    servicePublic: writeSecretFile(join(secretsDir, SECRET_FILES.servicePublic), servicePublic),
    usersDbPassword: writeSecretFile(join(secretsDir, SECRET_FILES.usersDbPassword), dbPassword),
    usersDatabaseUrl: writeSecretFile(
      join(secretsDir, SECRET_FILES.usersDatabaseUrl),
      databaseUrl,
    ),
  };
}

const REQUIRED_COINCIDENCE = {
  AUTH_JWT_ACTIVE_KID: ACCESS_KID,
  AUTH_JWT_ISSUER,
  AUTH_JWT_AUDIENCE,
  AUTH_OUTBOUND_SERVICE_KID: OUTBOUND_KID,
  AUTH_OUTBOUND_SERVICE_ISSUER: OUTBOUND_ISSUER,
  AUTH_OUTBOUND_SERVICE_AUDIENCE: OUTBOUND_AUDIENCE,
  AUTH_OUTBOUND_SERVICE_SCOPE: OUTBOUND_SCOPE,
  USERS_JWT_ISSUER: AUTH_JWT_ISSUER,
  USERS_JWT_AUDIENCE: AUTH_JWT_AUDIENCE,
  USERS_JWT_KID: ACCESS_KID,
  USERS_SERVICE_JWT_ISSUER: OUTBOUND_ISSUER,
  USERS_SERVICE_JWT_AUDIENCE: OUTBOUND_AUDIENCE,
  USERS_SERVICE_JWT_KID: OUTBOUND_KID,
  USERS_REGISTRATION_SCOPE: REGISTRATION_SCOPE,
  USERS_LOOKUP_SCOPE: LOOKUP_SCOPE,
};

function buildGeneratedValues({ access, outbound, gateway, dbPassword, redisPassword }) {
  return {
    NODE_ENV: 'development',
    AUTH_DATABASE_URL: `postgresql://stayhub_auth:${dbPassword}@auth-db:5432/auth_db?schema=public`,
    AUTH_REDIS_URL: `redis://:${redisPassword}@auth-redis:6379/0`,
    AUTH_REDIS_PASSWORD: redisPassword,
    AUTH_DB_PASSWORD: dbPassword,
    AUTH_JWT_ACTIVE_KID: ACCESS_KID,
    AUTH_JWT_PRIVATE_KEY: access.privateKey,
    AUTH_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ [ACCESS_KID]: access.publicKey }),
    AUTH_JWT_ISSUER,
    AUTH_JWT_AUDIENCE,
    AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON: JSON.stringify({ [INBOUND_KID]: gateway.publicKey }),
    AUTH_INBOUND_SERVICE_ISSUER: INBOUND_ISSUER,
    AUTH_INBOUND_SERVICE_AUDIENCE: INBOUND_AUDIENCE,
    AUTH_INBOUND_SERVICE_SCOPE: INBOUND_SCOPE,
    AUTH_OUTBOUND_SERVICE_PRIVATE_KEY: outbound.privateKey,
    AUTH_OUTBOUND_SERVICE_KID: OUTBOUND_KID,
    AUTH_OUTBOUND_SERVICE_ISSUER: OUTBOUND_ISSUER,
    AUTH_OUTBOUND_SERVICE_AUDIENCE: OUTBOUND_AUDIENCE,
    AUTH_OUTBOUND_SERVICE_SCOPE: OUTBOUND_SCOPE,
    AUTH_OUTBOUND_SERVICE_TTL_SECONDS: '60',
    USERS_SERVICE_URL: 'http://users-service:3002',
    AUTH_REFRESH_TOKEN_HMAC_SECRET: secret(),
    AUTH_REGISTRATION_FINGERPRINT_SECRET: secret(),
    AUTH_LOGIN_IDENTIFIER_HMAC_SECRET: secret(),
    USERS_JWT_ISSUER: AUTH_JWT_ISSUER,
    USERS_JWT_AUDIENCE: AUTH_JWT_AUDIENCE,
    USERS_JWT_KID: ACCESS_KID,
    USERS_SERVICE_JWT_ISSUER: OUTBOUND_ISSUER,
    USERS_SERVICE_JWT_AUDIENCE: OUTBOUND_AUDIENCE,
    USERS_SERVICE_JWT_KID: OUTBOUND_KID,
    USERS_REGISTRATION_SCOPE: REGISTRATION_SCOPE,
    USERS_LOOKUP_SCOPE: LOOKUP_SCOPE,
    USERS_DB_PASSWORD_FILE: `./secrets/${SECRET_FILES.usersDbPassword}`,
    USERS_DATABASE_URL_FILE: `./secrets/${SECRET_FILES.usersDatabaseUrl}`,
    USERS_JWT_PUBLIC_KEY_FILE: `./secrets/${SECRET_FILES.accessPublic}`,
    USERS_SERVICE_JWT_PUBLIC_KEY_FILE: `./secrets/${SECRET_FILES.servicePublic}`,
  };
}

function renderEnv(exampleContents, replacements) {
  const rendered = exampleContents
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([A-Z0-9_]+)=/.exec(line);
      if (!match || !(match[1] in replacements)) return line;
      return `${match[1]}=${envValue(replacements[match[1]])}`;
    })
    .join('\n');
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

function ensureSecretsDirectory(secretsDir) {
  mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  chmodSync(secretsDir, 0o700);
}

function reuseExistingEnvironment(envPath, secretsDir) {
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  const conflicts = [];

  for (const [name, expected] of Object.entries(REQUIRED_COINCIDENCE)) {
    const value = env.get(name);
    if (value === undefined) conflicts.push(`falta ${name}`);
    else if (value !== expected) conflicts.push(`${name} no coincide con la configuración de integración`);
  }

  const read = (name) => {
    const value = env.get(name);
    return value === undefined ? '' : unescapeValue(value);
  };
  const accessPrivate = read('AUTH_JWT_PRIVATE_KEY');
  const outboundPrivate = read('AUTH_OUTBOUND_SERVICE_PRIVATE_KEY');
  const dbPassword = read('AUTH_DB_PASSWORD');
  if (accessPrivate === '' || !accessPrivate.includes('-----BEGIN ')) {
    conflicts.push('AUTH_JWT_PRIVATE_KEY ausente o inválida');
  }
  if (outboundPrivate === '' || !outboundPrivate.includes('-----BEGIN ')) {
    conflicts.push('AUTH_OUTBOUND_SERVICE_PRIVATE_KEY ausente o inválida');
  }
  if (dbPassword === '') conflicts.push('AUTH_DB_PASSWORD ausente');

  const gatewayPrivatePath = join(secretsDir, SECRET_FILES.gatewayPrivate);
  const gatewayPrivate = readSecretFile(gatewayPrivatePath);
  if (gatewayPrivate === undefined) {
    conflicts.push(`falta ${gatewayPrivatePath}; elimina .env y secrets/ para regenerar`);
  }

  if (conflicts.length > 0) throw new DevEnvConflictError(conflicts);

  const files = writeUsersSecretFiles(secretsDir, {
    accessPublic: derivePublicKey(accessPrivate),
    servicePublic: derivePublicKey(outboundPrivate),
    dbPassword,
    databaseUrl: `postgresql://users:${dbPassword}@users-db:5432/users_db`,
  });
  files.gatewayPublic = writeSecretFile(
    join(secretsDir, SECRET_FILES.gatewayPublic),
    derivePublicKey(gatewayPrivate),
  );

  return { created: false, reused: true, envPath, secretsDir, files };
}

function createFreshEnvironment(envPath, secretsDir, examplePath) {
  const access = rsaPair();
  const outbound = rsaPair();
  const gateway = rsaPair();
  const dbPassword = secret();
  const redisPassword = secret();

  const replacements = buildGeneratedValues({
    access,
    outbound,
    gateway,
    dbPassword,
    redisPassword,
  });

  const rendered = renderEnv(readFileSync(examplePath, 'utf8'), replacements);

  const files = writeUsersSecretFiles(secretsDir, {
    accessPublic: access.publicKey,
    servicePublic: outbound.publicKey,
    dbPassword,
    databaseUrl: `postgresql://users:${dbPassword}@users-db:5432/users_db`,
  });
  files.gatewayPublic = writeSecretFile(
    join(secretsDir, SECRET_FILES.gatewayPublic),
    gateway.publicKey,
  );
  files.gatewayPrivate = writeSecretFile(
    join(secretsDir, SECRET_FILES.gatewayPrivate),
    gateway.privateKey,
  );

  writeFileSync(envPath, rendered, { encoding: 'utf8', mode: 0o600 });
  chmodSync(envPath, 0o600);

  return { created: true, reused: false, envPath, secretsDir, files };
}

// Genera la configuración si no existe; si ya existe, la valida y reutiliza sin
// sobrescribir `.env` ni rotar claves. Devuelve las rutas de los secretos escritos.
export function ensureDevEnvironment({ root, examplePath = join(root, '.env.example') } = {}) {
  if (!root) throw new Error('ensureDevEnvironment requiere "root"');
  const envPath = join(root, '.env');
  const secretsDir = join(root, 'secrets');
  ensureSecretsDirectory(secretsDir);
  return existsSync(envPath)
    ? reuseExistingEnvironment(envPath, secretsDir)
    : createFreshEnvironment(envPath, secretsDir, examplePath);
}
