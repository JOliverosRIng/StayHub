import { Injectable, Logger } from '@nestjs/common';
@Injectable()
export class SearchLogger {
  private readonly logger = new Logger('SearchService');
  public info(message: string, context: Readonly<Record<string, unknown>> = {}): void { this.logger.log(JSON.stringify({ message, ...this.redact(context) })); }
  public warn(message: string, context: Readonly<Record<string, unknown>> = {}): void { this.logger.warn(JSON.stringify({ message, ...this.redact(context) })); }
  private redact(context: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(context).map(([key, value]) => [/token|authorization|password|url|query/iu.test(key) ? key : key, /token|authorization|password|url|query/iu.test(key) ? '[REDACTED]' : value]));
  }
}
