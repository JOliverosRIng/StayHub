import type { Clock } from '@auth/application/ports/clock.port';

export class FakeClock implements Clock {
  private current: Date;

  public constructor(start: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.current = new Date(start.getTime());
  }

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public advanceMillis(millis: number): void {
    this.current = new Date(this.current.getTime() + millis);
  }

  public advanceSeconds(seconds: number): void {
    this.advanceMillis(seconds * 1000);
  }

  public set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}
