import { Injectable } from '@nestjs/common';
import type { DeliveryPort, DeliveryResult } from '../../application/ports/delivery.port';

@Injectable()
export class InAppAdapter implements DeliveryPort {
  readonly channel = 'IN_APP';
  deliver(notification: { recipientEmail: null; subject: string; body: string }): Promise<DeliveryResult> {
    void notification;
    return Promise.resolve({ accepted: true });
  }
}
