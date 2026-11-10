export interface IdempotencyRecord {
  readonly scope: string;
  readonly key: string;
  readonly callerSubject: string;
  readonly requestFingerprint: string;
  readonly responseStatus: number | null;
  readonly responseBody: Readonly<Record<string, unknown>> | null;
  readonly resourceId: string | null;
  readonly expiresAt: Date;
}

export interface IdempotencyRepository {
  find(scope: string, key: string, callerSubject: string): Promise<IdempotencyRecord | null>;
  reserve(record: IdempotencyRecord): Promise<{ readonly record: IdempotencyRecord; readonly created: boolean }>;
  complete(
    scope: string,
    key: string,
    callerSubject: string,
    responseStatus: number,
    responseBody: Readonly<Record<string, unknown>>,
    resourceId: string,
  ): Promise<void>;
  releasePreDispatch(
    scope: string,
    key: string,
    callerSubject: string,
    proof: { readonly dispatch: 'NOT_DISPATCHED'; readonly reason: 'GATEWAY_UNAVAILABLE' },
  ): Promise<void>;
  purgeExpired(now: Date): Promise<number>;
}
