import { Injectable } from '@nestjs/common';
import type { DeliveryPort, DeliveryResult } from '../../application/ports/delivery.port';

@Injectable()
export class FakeEmailAdapter implements DeliveryPort {
  readonly channel = 'EMAIL';
  constructor(private readonly accepts = true) {}
  deliver(notification: { recipientEmail: string | null; subject: string; body: string }): Promise<DeliveryResult> {
    void notification;
    return Promise.resolve(this.accepts ? { accepted: true } : { accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' });
  }
}
