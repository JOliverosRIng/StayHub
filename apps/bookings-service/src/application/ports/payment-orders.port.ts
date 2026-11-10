export interface CreatePaymentOrder { bookingId:string; guestId:string; amount:string; currency:string; }
export interface PaymentOrdersPort { createOrder(command:CreatePaymentOrder,idempotencyKey:string):Promise<{paymentOrderId:string;status:'PENDING'}>; }
export const PAYMENT_ORDERS_PORT=Symbol('PAYMENT_ORDERS_PORT');
