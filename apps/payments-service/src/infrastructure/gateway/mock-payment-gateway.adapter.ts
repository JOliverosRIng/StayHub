import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, GatewayOperationKind, GatewayOperationResult, RefundFixtureResult } from '../persistence/generated/client';
import type { MockGatewayOperation } from '../persistence/generated/client';
import type {
  ChargeCommand,
  ChargeResult,
  PaymentGatewayPort,
  RefundCommand,
  RefundResult,
  TransactionResult,
} from '../../application/ports/payment-gateway.port';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../config/payments-config';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { observeDependency } from '../observability/otel';
import { GatewayCircuitBreaker, GatewayCircuitOpenError, GatewayTimeoutError } from './gateway-circuit-breaker';

const OPERATION_HASH = /^[0-9a-f]{64}$/;
const PAYMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class MockPaymentGatewayAdapter implements PaymentGatewayPort {
  private readonly circuit: GatewayCircuitBreaker;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig,
  ) {
    this.circuit = new GatewayCircuitBreaker({
      failureThreshold: config.gatewayCircuitFailureThreshold,
      resetMs: config.gatewayCircuitResetMs,
      timeoutMs: config.gatewayTimeoutMs,
    });
  }

  async charge(command: ChargeCommand): Promise<ChargeResult> {
    const operationRefHash = this.operationHash(GatewayOperationKind.CHARGE, command.idempotencyReference);
    if (command.token === 'tok_gateway_down') {
      return { kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' };
    }
    try {
      return await observeDependency('gateway', 'charge', () => this.circuit.execute(async () => {
        const existing = await this.findOperation(operationRefHash);
        if (existing) return this.toChargeResult(existing);

        const fixture = this.chargeFixture(command.token);
        const operation = await this.persistOperation({
          operationRefHash,
          kind: GatewayOperationKind.CHARGE,
          result: fixture.result,
          failureCode: fixture.failureCode,
          refundFixtureResult: command.token === 'tok_refund_fails'
            ? RefundFixtureResult.REFUND_DECLINED
            : RefundFixtureResult.NORMAL,
        });
        // The ledger is committed before the mock deliberately loses this response.
        if (command.token === 'tok_gateway_timeout') return { kind: 'uncertain', reference: operationRefHash };
        return this.toChargeResult(operation);
      }));
    } catch (error) {
      if (error instanceof GatewayCircuitOpenError) {
        return { kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' };
      }
      if (error instanceof GatewayTimeoutError) return { kind: 'uncertain', reference: operationRefHash };
      // A persistence outage cannot prove that the operation was never recorded.
      return { kind: 'uncertain', reference: operationRefHash };
    }
  }

  async refund(command: RefundCommand): Promise<RefundResult> {
    const operationRefHash = this.operationHash(GatewayOperationKind.REFUND, command.idempotencyReference);
    try {
      return await observeDependency('gateway', 'refund', () => this.circuit.execute(async () => {
        const existing = await this.findOperation(operationRefHash);
        if (existing) return this.toRefundResult(existing);

        if (!OPERATION_HASH.test(command.paymentReference)) {
          return { kind: 'uncertain', reference: operationRefHash };
        }
        const charge = await this.findOperation(command.paymentReference);
        if (!charge || charge.kind !== GatewayOperationKind.CHARGE || charge.result !== GatewayOperationResult.APPROVED) {
          return { kind: 'uncertain', reference: operationRefHash };
        }

        const failed = charge.refundFixtureResult === RefundFixtureResult.REFUND_DECLINED;
        const refund = await this.persistOperation({
          operationRefHash,
          kind: GatewayOperationKind.REFUND,
          result: failed ? GatewayOperationResult.REFUND_FAILED : GatewayOperationResult.REFUND_COMPLETED,
          failureCode: failed ? 'CARD_DECLINED' : null,
          refundFixtureResult: null,
        });
        return this.toRefundResult(refund);
      }));
    } catch (error) {
      if (error instanceof GatewayCircuitOpenError) {
        return { kind: 'not-dispatched', reason: 'GATEWAY_UNAVAILABLE' };
      }
      if (error instanceof GatewayTimeoutError) return { kind: 'uncertain', reference: operationRefHash };
      return { kind: 'uncertain', reference: operationRefHash };
    }
  }

  async getTransaction(reference: string): Promise<TransactionResult> {
    const operationRefHash = OPERATION_HASH.test(reference)
      ? reference
      : PAYMENT_ID.test(reference)
        ? this.operationHash(GatewayOperationKind.CHARGE, reference)
        : null;
    if (!operationRefHash) return { kind: 'unknown' };
    try {
      const operation = await this.findOperation(operationRefHash);
      if (!operation || operation.result === GatewayOperationResult.UNKNOWN) return { kind: 'unknown' };
      if (operation.kind === GatewayOperationKind.CHARGE) {
        if (operation.result === GatewayOperationResult.APPROVED) return { kind: 'approved', reference: operationRefHash };
        if (operation.result === GatewayOperationResult.DECLINED) {
          return {
            kind: 'declined',
            reference: operationRefHash,
            failureCode: this.chargeFailureCode(operation.failureCode),
          };
        }
      }
      if (operation.result === GatewayOperationResult.REFUND_COMPLETED) return { kind: 'refund-completed', reference: operationRefHash };
      if (operation.result === GatewayOperationResult.REFUND_FAILED) {
        return { kind: 'refund-failed', reference: operationRefHash, failureCode: this.refundFailureCode(operation.failureCode) };
      }
      return { kind: 'unknown' };
    } catch {
      return { kind: 'unknown' };
    }
  }

  private chargeFixture(token: string): {
    readonly result: GatewayOperationResult;
    readonly failureCode: string | null;
  } {
    switch (token) {
      case 'tok_declined_funds':
        return { result: GatewayOperationResult.DECLINED, failureCode: 'INSUFFICIENT_FUNDS' };
      case 'tok_declined_fraud':
        return { result: GatewayOperationResult.DECLINED, failureCode: 'SUSPECTED_FRAUD' };
      case 'tok_declined_card':
        return { result: GatewayOperationResult.DECLINED, failureCode: 'CARD_DECLINED' };
      default:
        return { result: GatewayOperationResult.APPROVED, failureCode: null };
    }
  }

  private async findOperation(operationRefHash: string): Promise<MockGatewayOperation | null> {
    return observeDependency('postgresql', 'mock_gateway_ledger_read', () =>
      this.prisma.mockGatewayOperation.findUnique({ where: { operationRefHash } }),
    );
  }

  private async persistOperation(input: {
    readonly operationRefHash: string;
    readonly kind: GatewayOperationKind;
    readonly result: GatewayOperationResult;
    readonly failureCode: string | null;
    readonly refundFixtureResult: RefundFixtureResult | null;
  }): Promise<MockGatewayOperation> {
    try {
      return await observeDependency('postgresql', 'mock_gateway_ledger_write', () =>
        this.prisma.mockGatewayOperation.create({
          data: { ...input, resolvedAt: new Date() },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.findOperation(input.operationRefHash);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private toChargeResult(operation: MockGatewayOperation): ChargeResult {
    if (operation.result === GatewayOperationResult.APPROVED) {
      return { kind: 'approved', reference: operation.operationRefHash };
    }
    if (operation.result === GatewayOperationResult.DECLINED) {
      return { kind: 'declined', reference: operation.operationRefHash, failureCode: this.chargeFailureCode(operation.failureCode) };
    }
    return { kind: 'uncertain', reference: operation.operationRefHash };
  }

  private toRefundResult(operation: MockGatewayOperation): RefundResult {
    if (operation.result === GatewayOperationResult.REFUND_COMPLETED) {
      return { kind: 'completed', reference: operation.operationRefHash };
    }
    if (operation.result === GatewayOperationResult.REFUND_FAILED) {
      return { kind: 'failed', reference: operation.operationRefHash, failureCode: this.refundFailureCode(operation.failureCode) };
    }
    return { kind: 'uncertain', reference: operation.operationRefHash };
  }

  private chargeFailureCode(value: string | null): 'INSUFFICIENT_FUNDS' | 'CARD_DECLINED' | 'SUSPECTED_FRAUD' {
    if (value === 'INSUFFICIENT_FUNDS' || value === 'SUSPECTED_FRAUD') return value;
    return 'CARD_DECLINED';
  }

  private refundFailureCode(value: string | null): 'GATEWAY_UNAVAILABLE' | 'CARD_DECLINED' {
    return value === 'GATEWAY_UNAVAILABLE' ? value : 'CARD_DECLINED';
  }

  private operationHash(kind: GatewayOperationKind, reference: string): string {
    return createHmac('sha256', this.config.tokenHmacSecret)
      .update(`${kind}\0${reference}`, 'utf8')
      .digest('hex');
  }
}
