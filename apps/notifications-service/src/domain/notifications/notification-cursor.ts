export interface NotificationCursor { createdAt: Date; id: string }
export class InvalidNotificationCursorError extends Error { readonly code = 'INVALID_CURSOR'; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  if (Number.isNaN(cursor.createdAt.getTime()) || !UUID.test(cursor.id)) throw new InvalidNotificationCursorError('Invalid cursor value');
  return Buffer.from(JSON.stringify({ v: 1, createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeNotificationCursor(token: string): NotificationCursor {
  try {
    if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const value: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const cursor = value as Record<string, unknown>;
    if (Object.keys(cursor).length !== 3 || cursor.v !== 1 || typeof cursor.createdAt !== 'string' || typeof cursor.id !== 'string' || !UUID.test(cursor.id)) throw new Error();
    const createdAt = new Date(cursor.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== cursor.createdAt) throw new Error();
    return { createdAt, id: cursor.id };
  } catch {
    throw new InvalidNotificationCursorError('Invalid notification cursor');
  }
}
