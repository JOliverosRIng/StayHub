import type { Currency } from '../../domain/shared/money';

export interface ChargeCommand {
  readonly paymentId: string;
  /** Ephemeral provider token: never persist or log this command. */
  readonly token: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly idempotencyReference: string;
}

export interface RefundCommand {
  readonly refundId: string;
  readonly paymentReference: string;
  readonly amountMinor: number;
  readonly currency: Currency;
  readonly idempotencyReference: string;
}

export type ChargeResult =
  | { readonly kind: 'approved'; readonly reference: string }
  | {
      readonly kind: 'declined';
      readonly reference: string;
      readonly failureCode: 'INSUFFICIENT_FUNDS' | 'CARD_DECLINED' | 'SUSPECTED_FRAUD';
    }
  | { readonly kind: 'uncertain'; readonly reference?: string }
  | { readonly kind: 'not-dispatched'; readonly reason: 'GATEWAY_UNAVAILABLE' };

export type RefundResult =
  | { readonly kind: 'completed'; readonly reference: string }
  | { readonly kind: 'failed'; readonly reference: string; readonly failureCode: 'GATEWAY_UNAVAILABLE' | 'CARD_DECLINED' }
  | { readonly kind: 'uncertain'; readonly reference?: string }
  | { readonly kind: 'not-dispatched'; readonly reason: 'GATEWAY_UNAVAILABLE' };

export type TransactionResult =
  | { readonly kind: 'approved'; readonly reference: string }
  | {
      readonly kind: 'declined';
      readonly reference: string;
      readonly failureCode: 'INSUFFICIENT_FUNDS' | 'CARD_DECLINED' | 'SUSPECTED_FRAUD';
    }
  | { readonly kind: 'refund-completed'; readonly reference: string }
  | { readonly kind: 'refund-failed'; readonly reference: string; readonly failureCode: 'GATEWAY_UNAVAILABLE' | 'CARD_DECLINED' }
  | { readonly kind: 'unknown' };

export interface PaymentGatewayPort {
  charge(command: ChargeCommand): Promise<ChargeResult>;
  refund(command: RefundCommand): Promise<RefundResult>;
  getTransaction(reference: string): Promise<TransactionResult>;
}
