import { Injectable } from '@nestjs/common';

export type NotificationDeliveryState = 'up' | 'degraded' | 'unknown';

@Injectable()
export class NotificationDeliveryHealth {
  private lastSuccessAt: Date | undefined;
  private lastErrorCode: string | undefined;
  private degraded = false;

  public recordSuccess(): void {
    this.lastSuccessAt = new Date();
    this.lastErrorCode = undefined;
    this.degraded = false;
  }

  public recordFailure(code: string): void {
    this.lastErrorCode = code.slice(0, 80);
    this.degraded = true;
  }

  public snapshot(): { state: NotificationDeliveryState; lastSuccessAt: string | null; lastErrorCode: string | null } {
    return {
      state: this.degraded ? 'degraded' : this.lastSuccessAt ? 'up' : 'unknown',
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastErrorCode: this.degraded ? this.lastErrorCode ?? null : null,
    };
  }
}
