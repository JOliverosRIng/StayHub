import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DomainError } from '../../../domain/shared/domain-error';
import {
  RefundPayment,
  type RefundPaymentInput,
  type RefundPaymentResponse,
} from '../../../application/refunds/refund-payment.use-case';
import { ServiceAuthGuard, ServiceScope, type ServicePrincipalRequest } from '../guards/service-auth.guard';
import { RefundPaymentDto } from './refund-payment.dto';

@ApiTags('Refunds')
@Controller('payments')
@UseGuards(ServiceAuthGuard)
@ApiSecurity('serviceJwt', ['payments:refund'])
export class RefundsController {
  constructor(private readonly refundPayment: RefundPayment) {}

  @Post(':id/refund')
  @ServiceScope('refund')
  @ApiOperation({
    operationId: 'refundPayment',
    summary: 'Reembolsar total o parcialmente un pago aprobado',
    description: 'Solo bookings-service con scope payments:refund. Un resultado ambiguo conserva el reembolso PENDING.',
  })
  @ApiParam({ name: 'id', required: true, description: 'UUID del pago.', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID por operación lógica dentro del alcance de este pago y llamador.',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ required: true, schema: { $ref: '#/components/schemas/RefundRequest' } })
  @ApiResponse({
    status: 201,
    description: 'Reembolso procesado (completado o fallido) o respuesta reproducida.',
    headers: {
      'Idempotent-Replay': { description: 'true cuando la respuesta fue reproducida.', schema: { type: 'string', enum: ['true'] } },
    },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Refund' } } },
  })
  @ApiResponse({
    status: 202,
    description: 'Resultado ambiguo de pasarela; el reembolso permanece PENDING y bloquea otro intento.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Refund' } } },
  })
  @ApiResponse({ status: 400, description: 'Solicitud inválida.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 401, description: 'Autenticación requerida.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 403, description: 'Scope de servicio insuficiente.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 404, description: 'Pago inexistente.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 409, description: 'Pago no reembolsable, reembolso en curso o conflicto de idempotencia.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 422, description: 'Monto fuera del saldo o motivo incompatible.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 503, description: 'La pasarela confirmó que el reembolso no fue despachado.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  async refund(
    @Param('id') paymentId: string,
    @Body() body: RefundPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ServicePrincipalRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefundPaymentResponse> {
    if (!idempotencyKey) throw new DomainError('VALIDATION_ERROR', 'Idempotency-Key header is required');
    const callerSubject = request.paymentsServicePrincipal?.subject;
    if (!callerSubject) throw new DomainError('FORBIDDEN', 'Authenticated service principal is missing');
    const input: RefundPaymentInput = { ...body, paymentId, idempotencyKey, callerSubject };
    const result = await this.refundPayment.execute(input);
    response.status(result.statusCode);
    if (result.replayed) response.setHeader('Idempotent-Replay', 'true');
    return result.refund;
  }
}
