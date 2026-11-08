import { DomainError } from './domain-error';

export const MAX_MONEY_MINOR = 9_000_000_000_000;
export const MONEY_CURRENCIES = ['COP', 'USD'] as const;

export type Currency = (typeof MONEY_CURRENCIES)[number];

/** Amounts are always expressed in minor units (centésimas for COP/USD). */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: Currency,
  ) {}

  static fromMinor(
    amountMinor: number,
    currency: Currency,
    maxAmountMinor: number = MAX_MONEY_MINOR,
  ): Money {
    if (!Number.isSafeInteger(maxAmountMinor) || maxAmountMinor < 0 || maxAmountMinor > MAX_MONEY_MINOR) {
      throw new DomainError('VALIDATION_ERROR', 'Maximum amount is outside the supported range', [
        { field: 'maxAmountMinor', message: `Must be an integer from 0 to ${MAX_MONEY_MINOR}` },
      ]);
    }
    if (!MONEY_CURRENCIES.includes(currency)) {
      throw new DomainError('VALIDATION_ERROR', 'Unsupported currency', [
        { field: 'currency', message: 'Currency must be COP or USD' },
      ]);
    }
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > maxAmountMinor) {
      throw new DomainError('VALIDATION_ERROR', 'Amount is outside the supported range', [
        { field: 'amountMinor', message: `Must be a non-negative safe integer no greater than ${maxAmountMinor}` },
      ]);
    }
    return new Money(amountMinor, currency);
  }

  add(other: Money, maxAmountMinor: number = MAX_MONEY_MINOR): Money {
    this.assertSameCurrency(other);
    const sum = this.amountMinor + other.amountMinor;
    if (!Number.isSafeInteger(sum) || sum > maxAmountMinor || sum > MAX_MONEY_MINOR) {
      throw new DomainError('VALIDATION_ERROR', 'Money addition exceeds the supported maximum', [
        { field: 'amountMinor', message: 'The sum exceeds the configured maximum' },
      ]);
    }
    return Money.fromMinor(sum, this.currency, maxAmountMinor);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const difference = this.amountMinor - other.amountMinor;
    if (difference < 0) {
      throw new DomainError('VALIDATION_ERROR', 'Money subtraction cannot produce a negative amount', [
        { field: 'amountMinor', message: 'The result cannot be negative' },
      ]);
    }
    return Money.fromMinor(difference, this.currency);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amountMinor === other.amountMinor) return 0;
    return this.amountMinor < other.amountMinor ? -1 : 1;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainError('VALIDATION_ERROR', 'Cannot operate on different currencies', [
        { field: 'currency', message: 'Both amounts must use the same currency' },
      ]);
    }
  }
}
