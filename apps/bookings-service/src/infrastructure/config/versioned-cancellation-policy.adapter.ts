import { Inject, Injectable } from '@nestjs/common';
import type { CancellationDecision, CancellationPolicyPort } from '@bookings/application/ports/cancellation-policy.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import type { BookingsConfig } from './bookings-config';
import { BOOKINGS_CONFIG } from './config.module';

const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED']);

@Injectable()
export class VersionedCancellationPolicyAdapter implements CancellationPolicyPort {
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig) {}

  public evaluate(input: { actor: 'GUEST' | 'OWNER'; status: string; checkIn: string; now: Date }): CancellationDecision {
    const rules = this.config.cancellationPolicy;
    if (!rules || rules.version !== this.config.cancellationPolicyVersion) throw new DomainError('DEPENDENCY_UNAVAILABLE');
    if (!CANCELLABLE.has(input.status)) return { eligible: false, refundMode: 'NONE', policyVersion: rules.version };
    const deadline = Date.parse(`${input.checkIn}T00:00:00.000Z`) - rules.freeCancellationBeforeHours * 3_600_000;
    if (!Number.isFinite(deadline) || input.now.getTime() > deadline) return { eligible: false, refundMode: 'NONE', policyVersion: rules.version };
    const refundMode = rules.refundPercent >= 100 ? 'FULL' : rules.refundPercent > 0 ? 'POLICY' : 'NONE';
    return { eligible: true, refundMode, policyVersion: rules.version };
  }
}
