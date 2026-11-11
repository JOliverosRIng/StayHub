import { readFileSync } from 'node:fs';
export interface CancellationPolicyRules {
  version: string;
  freeCancellationBeforeHours: number;
  refundPercent: number;
}
export interface BookingsConfig {
  port: number; databaseUrl: string; jwtPublicKeys: Readonly<Record<string,string>>; jwtIssuer: string; jwtAudience: string; jwtScope: string; reviewEligibilityScope: string; reviewEligibilityAudience: string;
  accommodationsUrl: string; paymentsUrl: string; paymentsMockToken: string | undefined; dependencyTimeoutMs: number; paymentHoldMinutes: number; cancellationPolicyVersion: string; cancellationPolicy: CancellationPolicyRules | null;
  notificationsUrl: string; notificationsJwtAudience: string; notificationsJwtScope: string; notificationsTimeoutMs: number;
  notificationPollIntervalMs: number; notificationBatchSize: number; notificationMaxAttempts: number; notificationRetryBaseMs: number; notificationWorkLeaseMs: number;
  workerPollIntervalMs: number; workerBatchSize: number; outboxBatchSize: number;
  rabbitmqUrl: string; rabbitmqOutboundExchange: string; rabbitmqPaymentsExchange: string; rabbitmqQueue: string; rabbitmqRetryQueue: string; rabbitmqDlq: string; rabbitmqPrefetch: number; rabbitmqMaxRetries: number; rabbitmqRetryDelayMs: number; shutdownGraceMs: number; logLevel: string; otlpEndpoint: string;
}
function required(name: string, value?: string): string { if (!value?.trim()) throw new Error(`Missing required configuration: ${name}`); return value.trim(); }
function secret(env: NodeJS.ProcessEnv, name: string): string { const file = env[`${name}_FILE`]; return required(name, file?.trim() ? readFileSync(file.trim(),'utf8') : env[name]); }
function integer(name: string, raw: string | undefined, fallback?: number): number { const value = raw === undefined && fallback !== undefined ? fallback : Number(raw); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }
function url(name: string, raw?: string): string { const value = required(name, raw); const parsed = new URL(value); if (!['http:','https:','amqp:','amqps:','postgres:','postgresql:'].includes(parsed.protocol)) throw new Error(`${name} has invalid protocol`); return value.replace(/\/$/u,''); }
function keys(raw: string): Readonly<Record<string,string>> { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.entries(parsed as Record<string,unknown>).some(([k,v]) => !k || typeof v !== 'string')) throw new Error('BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON is invalid'); return Object.freeze(parsed as Record<string,string>); }
export function parseCancellationPolicy(raw: string | undefined, approvedVersion: string): CancellationPolicyRules | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('BOOKINGS_CANCELLATION_POLICY_JSON is invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('BOOKINGS_CANCELLATION_POLICY_JSON is invalid');
  const row = parsed as Record<string, unknown>;
  const version = row.version; const hours = row.freeCancellationBeforeHours; const percent = row.refundPercent;
  if (typeof version !== 'string' || !version.trim()) throw new Error('BOOKINGS_CANCELLATION_POLICY_JSON version is invalid');
  if (typeof hours !== 'number' || !Number.isSafeInteger(hours) || hours < 0) throw new Error('BOOKINGS_CANCELLATION_POLICY_JSON freeCancellationBeforeHours is invalid');
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('BOOKINGS_CANCELLATION_POLICY_JSON refundPercent is invalid');
  if (version !== approvedVersion) throw new Error('BOOKINGS_CANCELLATION_POLICY_JSON version must match BOOKINGS_CANCELLATION_POLICY_VERSION');
  return Object.freeze({ version, freeCancellationBeforeHours: hours, refundPercent: percent });
}
export function loadBookingsConfig(env: NodeJS.ProcessEnv = process.env): BookingsConfig {
  const port = integer('BOOKINGS_PORT', env.BOOKINGS_PORT, 3005); if (port !== 3005) throw new Error('BOOKINGS_PORT must be 3005');
  const cancellationPolicyVersion = required('BOOKINGS_CANCELLATION_POLICY_VERSION',env.BOOKINGS_CANCELLATION_POLICY_VERSION);
  const jwtAudience = required('BOOKINGS_SERVICE_JWT_AUDIENCE',env.BOOKINGS_SERVICE_JWT_AUDIENCE);
  return Object.freeze({
    port, databaseUrl: url('BOOKINGS_DATABASE_URL', secret(env,'BOOKINGS_DATABASE_URL')),
    jwtPublicKeys: keys(required('BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON',env.BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON)),
    jwtIssuer: required('BOOKINGS_SERVICE_JWT_ISSUER',env.BOOKINGS_SERVICE_JWT_ISSUER), jwtAudience, jwtScope: required('BOOKINGS_SERVICE_JWT_SCOPE',env.BOOKINGS_SERVICE_JWT_SCOPE),
    reviewEligibilityScope: env.BOOKINGS_REVIEWS_JWT_SCOPE?.trim() || 'reviews:eligibility', reviewEligibilityAudience: env.BOOKINGS_REVIEWS_JWT_AUDIENCE?.trim() || jwtAudience,
    accommodationsUrl: url('BOOKINGS_ACCOMMODATIONS_URL',env.BOOKINGS_ACCOMMODATIONS_URL), paymentsUrl: url('BOOKINGS_PAYMENTS_URL',env.BOOKINGS_PAYMENTS_URL), paymentsMockToken: env.BOOKINGS_PAYMENTS_MOCK_TOKEN?.trim() || undefined, dependencyTimeoutMs: integer('BOOKINGS_DEPENDENCY_TIMEOUT_MS',env.BOOKINGS_DEPENDENCY_TIMEOUT_MS,3000),
    notificationsUrl: url('BOOKINGS_NOTIFICATIONS_URL',env.BOOKINGS_NOTIFICATIONS_URL ?? 'http://notifications-service:3009'), notificationsJwtAudience: env.BOOKINGS_NOTIFICATIONS_JWT_AUDIENCE?.trim() || 'stayhub-notifications-service', notificationsJwtScope: env.BOOKINGS_NOTIFICATIONS_JWT_SCOPE?.trim() || 'notifications:send', notificationsTimeoutMs: integer('BOOKINGS_NOTIFICATIONS_TIMEOUT_MS',env.BOOKINGS_NOTIFICATIONS_TIMEOUT_MS,3000),
    notificationPollIntervalMs: integer('BOOKINGS_NOTIFICATION_WORK_POLL_INTERVAL_MS',env.BOOKINGS_NOTIFICATION_WORK_POLL_INTERVAL_MS,5000), notificationBatchSize: integer('BOOKINGS_NOTIFICATION_WORK_BATCH_SIZE',env.BOOKINGS_NOTIFICATION_WORK_BATCH_SIZE,10), notificationMaxAttempts: integer('BOOKINGS_NOTIFICATION_WORK_MAX_ATTEMPTS',env.BOOKINGS_NOTIFICATION_WORK_MAX_ATTEMPTS,8), notificationRetryBaseMs: integer('BOOKINGS_NOTIFICATION_WORK_RETRY_BASE_MS',env.BOOKINGS_NOTIFICATION_WORK_RETRY_BASE_MS,1000), notificationWorkLeaseMs: integer('BOOKINGS_NOTIFICATION_WORK_LEASE_MS',env.BOOKINGS_NOTIFICATION_WORK_LEASE_MS,300000),
    workerPollIntervalMs: integer('BOOKINGS_WORKER_POLL_INTERVAL_MS',env.BOOKINGS_WORKER_POLL_INTERVAL_MS,2000), workerBatchSize: integer('BOOKINGS_WORKER_BATCH_SIZE',env.BOOKINGS_WORKER_BATCH_SIZE,25), outboxBatchSize: integer('BOOKINGS_OUTBOX_BATCH_SIZE',env.BOOKINGS_OUTBOX_BATCH_SIZE,50),
    paymentHoldMinutes: integer('BOOKINGS_PAYMENT_HOLD_MINUTES',env.BOOKINGS_PAYMENT_HOLD_MINUTES), cancellationPolicyVersion, cancellationPolicy: parseCancellationPolicy(env.BOOKINGS_CANCELLATION_POLICY_JSON, cancellationPolicyVersion),
    rabbitmqUrl: url('BOOKINGS_RABBITMQ_URL',secret(env,'BOOKINGS_RABBITMQ_URL')), rabbitmqOutboundExchange: env.BOOKINGS_RABBITMQ_EXCHANGE?.trim() || 'stayhub.bookings.v1', rabbitmqPaymentsExchange: env.BOOKINGS_RABBITMQ_PAYMENTS_EXCHANGE?.trim() || 'stayhub.payments', rabbitmqQueue: env.BOOKINGS_RABBITMQ_QUEUE?.trim() || 'stayhub.bookings.payment-events.v1', rabbitmqRetryQueue: env.BOOKINGS_RABBITMQ_RETRY_QUEUE?.trim() || 'stayhub.bookings.payment-events.v1.retry', rabbitmqDlq: env.BOOKINGS_RABBITMQ_DLQ?.trim() || 'stayhub.bookings.payment-events.v1.dlq', rabbitmqPrefetch: integer('BOOKINGS_RABBITMQ_PREFETCH',env.BOOKINGS_RABBITMQ_PREFETCH,10), rabbitmqMaxRetries: integer('BOOKINGS_RABBITMQ_MAX_RETRIES',env.BOOKINGS_RABBITMQ_MAX_RETRIES,3), rabbitmqRetryDelayMs: integer('BOOKINGS_RABBITMQ_RETRY_DELAY_MS',env.BOOKINGS_RABBITMQ_RETRY_DELAY_MS,5000), shutdownGraceMs: integer('BOOKINGS_SHUTDOWN_GRACE_MS',env.BOOKINGS_SHUTDOWN_GRACE_MS,10000),
    logLevel: env.BOOKINGS_LOG_LEVEL?.trim() || 'info', otlpEndpoint: url('OTEL_EXPORTER_OTLP_ENDPOINT',env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'),
  });
}
