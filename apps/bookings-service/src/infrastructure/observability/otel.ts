import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';

let telemetry: NodeSDK | undefined;
export function startTelemetry(config: BookingsConfig): void { if (telemetry) return; const endpoint=config.otlpEndpoint.replace(/\/$/u,''); telemetry=new NodeSDK({serviceName:'stayhub-bookings-service',traceExporter:new OTLPTraceExporter({url:`${endpoint}/v1/traces`,timeoutMillis:config.dependencyTimeoutMs}),metricReader:new PeriodicExportingMetricReader({exporter:new OTLPMetricExporter({url:`${endpoint}/v1/metrics`,timeoutMillis:config.dependencyTimeoutMs}),exportIntervalMillis:30_000}),instrumentations:[]}); telemetry.start(); }
export async function stopTelemetry(): Promise<void> { const sdk=telemetry; telemetry=undefined; await sdk?.shutdown(); }
export async function observeDependency<T>(system:'postgresql'|'rabbitmq'|'http',operation:string,action:()=>Promise<T>):Promise<T>{return trace.getTracer('stayhub-bookings-service').startActiveSpan(`${system}.${operation}`,{kind:SpanKind.CLIENT,attributes:{'dependency.system':system,'dependency.operation':operation}},context.active(),async(span)=>{try{return await action();}catch(error){span.setStatus({code:SpanStatusCode.ERROR});throw error;}finally{span.end();}});}
