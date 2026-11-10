import { Money, MAX_MONEY_MINOR, type Currency } from '../../../src/domain/shared/money';
import { DomainError } from '../../../src/domain/shared/domain-error';

describe('Money', () => {
  const cop = (amount: number): Money => Money.fromMinor(amount, 'COP');

  it('accepts positive safe minor units for COP and USD', () => {
    expect(cop(0).amountMinor).toBe(0);
    expect(Money.fromMinor(100, 'COP').amountMinor).toBe(100);
    expect(Money.fromMinor(100, 'USD').currency).toBe('USD');
    expect(cop(MAX_MONEY_MINOR).amountMinor).toBe(MAX_MONEY_MINOR);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_MONEY_MINOR + 1])(
    'rejects invalid amount %s',
    (amount) => {
      expect(() => cop(amount)).toThrow(DomainError);
    },
  );

  it('enforces a configured business maximum no greater than the technical maximum', () => {
    expect(() => Money.fromMinor(101, 'COP', 100)).toThrow(DomainError);
    expect(() => Money.fromMinor(1, 'COP', MAX_MONEY_MINOR + 1)).toThrow(DomainError);
  });

  it('adds, subtracts, and compares values in the same currency', () => {
    expect(cop(100).add(cop(50)).amountMinor).toBe(150);
    expect(cop(100).subtract(cop(40)).amountMinor).toBe(60);
    expect(cop(100).subtract(cop(100)).amountMinor).toBe(0);
    expect(cop(100).compare(cop(100))).toBe(0);
    expect(cop(100).compare(cop(99))).toBe(1);
    expect(cop(99).compare(cop(100))).toBe(-1);
  });

  it('rejects overflow, negative subtraction, and mixed currencies', () => {
    expect(() => cop(MAX_MONEY_MINOR).add(cop(1))).toThrow(DomainError);
    expect(() => cop(10).subtract(cop(11))).toThrow(DomainError);
    expect(() => cop(10).add(Money.fromMinor(1, 'USD'))).toThrow(DomainError);
    expect(() => cop(10).compare(Money.fromMinor(1, 'USD'))).toThrow(DomainError);
  });

  it('only accepts the supported ISO currencies', () => {
    expect(() => Money.fromMinor(10, 'EUR' as Currency)).toThrow(DomainError);
  });
});
