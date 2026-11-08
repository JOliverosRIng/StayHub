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
  save(record: IdempotencyRecord): Promise<void>;
  delete(scope: string, key: string, callerSubject: string): Promise<void>;
}
