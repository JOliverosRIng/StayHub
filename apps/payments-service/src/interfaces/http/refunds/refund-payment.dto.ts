import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { REFUND_REASONS, type RefundReason } from '../../../domain/refunds/refund.policy';

export class RefundPaymentDto {
  @IsIn(REFUND_REASONS)
  reason!: RefundReason;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9_000_000_000_000)
  amountMinor?: number;
}
