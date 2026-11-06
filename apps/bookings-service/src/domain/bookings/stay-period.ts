import { invalid } from '@bookings/domain/shared/domain-error';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function epochDay(value: string): number {
  if (!DATE.test(value)) return invalid('date');
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return invalid('date');
  return time / 86_400_000;
}
export class StayPeriod {
  public readonly nights: number;
  private constructor(public readonly checkIn: string, public readonly checkOut: string) {
    this.nights = epochDay(checkOut) - epochDay(checkIn);
    if (this.nights <= 0) invalid('checkOut');
  }
  public static create(checkIn: string, checkOut: string, today?: string): StayPeriod {
    const period = new StayPeriod(checkIn, checkOut);
    if (today && epochDay(checkIn) < epochDay(today)) invalid('checkIn');
    return period;
  }
  public overlaps(other: StayPeriod): boolean { return this.checkIn < other.checkOut && this.checkOut > other.checkIn; }
}
