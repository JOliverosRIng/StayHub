import { metrics, trace } from '@opentelemetry/api';
export const searchTracer = trace.getTracer('stayhub-search-service');
export const searchMeter = metrics.getMeter('stayhub-search-service');
