export interface InboxPort { hasProcessed(eventId: string, payloadHash: string): Promise<boolean>; }
export const INBOX_PORT = Symbol('INBOX_PORT');
