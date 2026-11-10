import type { NotificationChannel } from '../../domain/notifications/notification.types';

export type DeliveryFailureCode = 'DELIVERY_UNAVAILABLE';
export interface DeliveryResult { accepted: boolean; failureCode?: DeliveryFailureCode }
export interface DeliveryPort { readonly channel: NotificationChannel; deliver(notification: { recipientEmail: string | null; subject: string; body: string }): Promise<DeliveryResult> }
export const DELIVERY_ADAPTERS = Symbol('DELIVERY_ADAPTERS');
