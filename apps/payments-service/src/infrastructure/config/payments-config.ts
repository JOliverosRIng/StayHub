import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface JwtConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly kid: string;
  readonly publicKey: string;
}

export type PaymentsCurrency = 'COP' | 'USD';

export interface PaymentsConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly userJwt: JwtConfig;
  readonly serviceJwt: JwtConfig;
  readonly chargeScope: string;
  readonly refundScope: string;
  readonly readScope: string;
  readonly allowedCurrencies: readonly PaymentsCurrency[];
  readonly maxAmountMinor: number;
  readonly gatewayTimeoutMs: number;
  readonly gatewayCircuitFailureThreshold: number;
  readonly gatewayCircuitResetMs: number;
  readonly idempotencyTtlHours: number;
  readonly tokenHmacSecret: string;
  readonly rabbitmqUrl: string | undefined;
  readonly rabbitmqExchange: string;
  readonly outboxPollIntervalMs: number;
  readonly outboxBatchSize: number;
  readonly outboxMaxAttempts: number;
  readonly outboxRetentionDays: number;
  readonly reconcilerIntervalMs: number;
  readonly reconcilerBatchSize: number;
  readonly reconcilerMaxAttempts: number;
  readonly otelServiceName: string;
  readonly otlpEndpoint: string;
}

export const PAYMENTS_CONFIG = Symbol('PAYMENTS_CONFIG');
const MAX_AMOUNT_MINOR = 9_000_000_000_000;

function configuredValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const filePath = env[`${name}_FILE`]?.trim();
  if (filePath) {
    try {
      return readFileSync(filePath, 'utf8').trim();
    } catch {
      throw new Error(`Invalid configuration: ${name}`);
    }
  }
  return env[name]?.trim();
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = configuredValue(env, name);
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`Invalid configuration: ${name}`);
  }
  return value;
}

function jwtConfig(env: NodeJS.ProcessEnv, prefix: string): JwtConfig {
  const publicKey = required(env, `${prefix}_PUBLIC_KEY`).replace(/\\n/g, '\n');
  try {
    if (publicKey.includes('PRIVATE KEY')) throw new Error();
    const key = createPublicKey(publicKey);
    if (
      key.asymmetricKeyType !== 'rsa' ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid configuration: ${prefix}_PUBLIC_KEY`);
  }

  return Object.freeze({
    issuer: required(env, `${prefix}_ISSUER`),
    audience: required(env, `${prefix}_AUDIENCE`),
    kid: required(env, `${prefix}_KID`),
    publicKey,
  });
}

function databaseUrl(env: NodeJS.ProcessEnv): string {
  const value = required(env, 'PAYMENTS_DATABASE_URL');
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.pathname !== '/payments_db' ||
      !url.hostname ||
      !url.username ||
      !url.password
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('Invalid configuration: PAYMENTS_DATABASE_URL');
  }
  return value;
}

function allowedCurrencies(env: NodeJS.ProcessEnv): readonly PaymentsCurrency[] {
  const raw = required(env, 'PAYMENTS_ALLOWED_CURRENCIES');
  const currencies = raw.split(',').map((currency) => currency.trim().toUpperCase());
  if (
    currencies.length === 0 ||
    currencies.some((currency) => currency !== 'COP' && currency !== 'USD') ||
    new Set(currencies).size !== currencies.length
  ) {
    throw new Error('PAYMENTS_ALLOWED_CURRENCIES must contain unique supported currency codes (COP, USD)');
  }
  return Object.freeze(currencies as PaymentsCurrency[]);
}

function optionalRabbitmqUrl(env: NodeJS.ProcessEnv): string | undefined {
  const value = configuredValue(env, 'PAYMENTS_RABBITMQ_URL');
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['amqp:', 'amqps:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch {
    throw new Error('Invalid configuration: PAYMENTS_RABBITMQ_URL');
  }
  return value;
}

export function loadPaymentsConfig(env: NodeJS.ProcessEnv = process.env): PaymentsConfig {
  const maxAmountMinor = positiveInteger(
    env,
    'PAYMENTS_MAX_AMOUNT_MINOR',
    MAX_AMOUNT_MINOR,
    MAX_AMOUNT_MINOR,
  );
  const tokenHmacSecret = required(env, 'PAYMENTS_TOKEN_HMAC_SECRET');
  if (tokenHmacSecret.length < 32) {
    throw new Error('PAYMENTS_TOKEN_HMAC_SECRET must contain at least 32 characters');
  }

  const userJwt = jwtConfig(env, 'PAYMENTS_JWT');
  const serviceJwt = jwtConfig(env, 'PAYMENTS_SERVICE_JWT');
  const chargeScope = required(env, 'PAYMENTS_CHARGE_SCOPE');
  const refundScope = required(env, 'PAYMENTS_REFUND_SCOPE');
  const readScope = required(env, 'PAYMENTS_READ_SCOPE');
  const scopes = [chargeScope, refundScope, readScope];
  if (new Set(scopes).size !== scopes.length || scopes.some((scope) => /\s/.test(scope))) {
    throw new Error('Payments scopes must be distinct single values');
  }

  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || 'http://localhost:4318';
  try {
    if (!['http:', 'https:'].includes(new URL(otlpEndpoint).protocol)) throw new Error();
  } catch {
    throw new Error('Invalid configuration: OTEL_EXPORTER_OTLP_ENDPOINT');
  }

  return Object.freeze({
    port: positiveInteger(env, 'PAYMENTS_PORT', 3006, 65_535),
    databaseUrl: databaseUrl(env),
    userJwt,
    serviceJwt,
    chargeScope,
    refundScope,
    readScope,
    allowedCurrencies: allowedCurrencies(env),
    maxAmountMinor,
    gatewayTimeoutMs: positiveInteger(env, 'PAYMENTS_GATEWAY_TIMEOUT_MS', 5_000),
    gatewayCircuitFailureThreshold: positiveInteger(
      env,
      'PAYMENTS_GATEWAY_CIRCUIT_FAILURE_THRESHOLD',
      5,
    ),
    gatewayCircuitResetMs: positiveInteger(env, 'PAYMENTS_GATEWAY_CIRCUIT_RESET_MS', 30_000),
    idempotencyTtlHours: positiveInteger(env, 'PAYMENTS_IDEMPOTENCY_TTL_HOURS', 48),
    tokenHmacSecret,
    rabbitmqUrl: optionalRabbitmqUrl(env),
    rabbitmqExchange: env.PAYMENTS_RABBITMQ_EXCHANGE?.trim() || 'stayhub.payments',
    outboxPollIntervalMs: positiveInteger(env, 'PAYMENTS_OUTBOX_POLL_INTERVAL_MS', 1_000),
    outboxBatchSize: positiveInteger(env, 'PAYMENTS_OUTBOX_BATCH_SIZE', 50),
    outboxMaxAttempts: positiveInteger(env, 'PAYMENTS_OUTBOX_MAX_ATTEMPTS', 5),
    outboxRetentionDays: positiveInteger(env, 'PAYMENTS_OUTBOX_RETENTION_DAYS', 7),
    reconcilerIntervalMs: positiveInteger(env, 'PAYMENTS_RECONCILER_INTERVAL_MS', 30_000),
    reconcilerBatchSize: positiveInteger(env, 'PAYMENTS_RECONCILER_BATCH_SIZE', 50),
    reconcilerMaxAttempts: positiveInteger(env, 'PAYMENTS_RECONCILER_MAX_ATTEMPTS', 5),
    otelServiceName: env.PAYMENTS_OTEL_SERVICE_NAME?.trim() || 'stayhub-payments-service',
    otlpEndpoint,
  });
}
