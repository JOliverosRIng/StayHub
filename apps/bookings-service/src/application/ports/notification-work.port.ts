export interface ClaimedNotificationWork {
  id: string;
  bookingId: string;
  attempts: number;
}

export interface NotificationWorkPort {
  claim(limit: number): Promise<ClaimedNotificationWork[]>;
  succeeded(id: string): Promise<void>;
  retry(id: string, attempts: number, code: string): Promise<void>;
  dead(id: string, code: string): Promise<void>;
}

export const NOTIFICATION_WORK_PORT = Symbol('NOTIFICATION_WORK_PORT');
