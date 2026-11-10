export interface CreatePaymentOrder { bookingId:string; guestId:string; amount:string; currency:string; }
export type CreatedPaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'FAILED';
export interface PaymentOrdersPort { createOrder(command:CreatePaymentOrder,idempotencyKey:string):Promise<{paymentId:string;status:CreatedPaymentStatus}>; }
export const PAYMENT_ORDERS_PORT=Symbol('PAYMENT_ORDERS_PORT');
