import { invalid } from '@bookings/domain/shared/domain-error';
const AMOUNT = /^\d{1,10}(?:\.\d{1,2})?$/;
export class Money {
  private constructor(private readonly cents: bigint, public readonly currency: string) {}
  public static parse(amount: string, currency: string): Money {
    if (!AMOUNT.test(amount) || !/^[A-Z]{3}$/.test(currency)) invalid('money');
    const [whole = '', fraction = ''] = amount.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents <= 0n) invalid('money.amount');
    return new Money(cents, currency);
  }
  public multiply(quantity: number): Money {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) invalid('quantity');
    return new Money(this.cents * BigInt(quantity), this.currency);
  }
  public toString(): string { return `${this.cents / 100n}.${(this.cents % 100n).toString().padStart(2, '0')}`; }
}
