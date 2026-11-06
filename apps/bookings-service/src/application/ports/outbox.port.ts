export interface OutboxPort { publishBatch(limit:number):Promise<number>; }
export const OUTBOX_PORT=Symbol('OUTBOX_PORT');
