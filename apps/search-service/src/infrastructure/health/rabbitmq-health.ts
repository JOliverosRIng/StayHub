import { Inject, Injectable } from '@nestjs/common';
import { connect } from 'amqplib';
import { SEARCH_CONFIG } from '../config/config.module';
import type { SearchConfig } from '../config/search-config';
import { observeDependency } from '../observability/otel';

@Injectable()
export class RabbitMqHealth {
  public constructor(@Inject(SEARCH_CONFIG) private readonly config: SearchConfig) {}
  public async health(): Promise<boolean> {
    return observeDependency('rabbitmq', 'health', async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.dependencyTimeoutMs);
      try {
        const connection = await connect(this.config.rabbitmqUrl, { timeout: this.config.dependencyTimeoutMs, signal: controller.signal });
        connection.on('error', () => { /* Probe errors must never become uncaught events. */ });
        await connection.close();
        return true;
      } catch { return false; }
      finally { clearTimeout(timer); }
    });
  }
}
