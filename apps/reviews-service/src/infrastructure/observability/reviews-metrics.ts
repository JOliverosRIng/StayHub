import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

@Injectable()
export class ReviewsMetrics {
  private readonly requests = metrics.getMeter('stayhub-reviews').createCounter('reviews_requests_total');
  private readonly dependencyLatency = metrics.getMeter('stayhub-reviews').createHistogram('reviews_dependency_duration_ms');
  public recordRequest(route: string, status: number): void { this.requests.add(1, { route, status }); }
  public recordDependency(durationMs: number, outcome: string): void { this.dependencyLatency.record(durationMs, { dependency: 'bookings', outcome }); }
}
