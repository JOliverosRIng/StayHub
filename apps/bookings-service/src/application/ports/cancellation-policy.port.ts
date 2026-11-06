export interface CancellationDecision { eligible: boolean; refundMode: 'NONE'|'POLICY'|'FULL'; policyVersion: string; }
export interface CancellationPolicyPort { evaluate(input: { actor: 'GUEST'|'OWNER'; status: string; checkIn: string; now: Date }): CancellationDecision; }
export const CANCELLATION_POLICY_PORT = Symbol('CANCELLATION_POLICY_PORT');
