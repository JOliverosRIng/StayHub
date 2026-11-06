import { Injectable } from '@nestjs/common';
import { metrics, type Attributes } from '@opentelemetry/api';

@Injectable()
export class BookingsMetrics {
  public increment(name: string, attributes: Attributes = {}): void { metrics.getMeter('stayhub-bookings-service').createCounter(name).add(1, attributes); }
  public duration(name: string, milliseconds: number, attributes: Attributes = {}): void { metrics.getMeter('stayhub-bookings-service').createHistogram(name, { unit: 'ms' }).record(milliseconds, attributes); }
}
