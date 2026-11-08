import {
  Body,
  Controller,
  Get,
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
import { CreatePayment, type CreatePaymentInput, type CreatePaymentResponse } from '../../../application/payments/create-payment.use-case';
import { GetPaymentStatus, type GetPaymentStatusResponse } from '../../../application/payments/get-payment-status.use-case';
import { ServiceAuthGuard, ServiceScope, type ServicePrincipalRequest } from '../guards/service-auth.guard';
import { PaymentReadAuthGuard, type PaymentReadRequest } from '../guards/payment-read-auth.guard';
import { CreatePaymentDto } from './create-payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly createPayment: CreatePayment,
    private readonly getPaymentStatus: GetPaymentStatus,
  ) {}

  @Post()
  @UseGuards(ServiceAuthGuard)
  @ServiceScope('charge')
  @ApiSecurity('serviceJwt', ['payments:charge'])
  @ApiOperation({
    operationId: 'createPayment',
    summary: 'Cobrar una reserva',
    description: 'Solo bookings-service con scope payments:charge. Resultado ambiguo permanece PENDING y responde 202.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID por operación lógica. Reintentos con el mismo cuerpo reproducen la respuesta original.',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ required: true, schema: { $ref: '#/components/schemas/CreatePaymentRequest' } })
  @ApiResponse({
    status: 201,
    description: 'Pago aprobado/rechazado o respuesta reproducida.',
    headers: {
      'Idempotent-Replay': {
        description: 'true cuando la respuesta fue reproducida.',
        schema: { type: 'string', enum: ['true'] },
      },
    },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } },
  })
  @ApiResponse({
    status: 202,
    description: 'Resultado ambiguo; el pago permanece PENDING.',
    headers: { Location: { description: 'URL de consulta del estado.', schema: { type: 'string' } } },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } },
  })
  @ApiResponse({ status: 400, description: 'Solicitud inválida.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 401, description: 'Autenticación requerida.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 403, description: 'Scope de servicio insuficiente.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 409, description: 'Conflicto de idempotencia o pago activo.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 503, description: 'La pasarela confirmó que el cobro no fue despachado.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  async create(
    @Body() body: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ServicePrincipalRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreatePaymentResponse> {
    if (!idempotencyKey) throw new DomainError('VALIDATION_ERROR', 'Idempotency-Key header is required');
    const callerSubject = request.paymentsServicePrincipal?.subject;
    if (!callerSubject) throw new DomainError('FORBIDDEN', 'Authenticated service principal is missing');
    const input: CreatePaymentInput = { ...body, idempotencyKey, callerSubject };
    const result = await this.createPayment.execute(input);
    response.status(result.statusCode);
    response.setHeader('Cache-Control', 'no-store');
    if (result.replayed) response.setHeader('Idempotent-Replay', 'true');
    if (result.statusCode === 202) response.setHeader('Location', `/payments/${result.payment.id}/status`);
    return result.payment;
  }

  @Get(':id/status')
  @UseGuards(PaymentReadAuthGuard)
  @ApiSecurity('userJwt')
  @ApiSecurity('serviceJwt', ['payments:read'])
  @ApiOperation({
    operationId: 'getPaymentStatus',
    summary: 'Consultar el estado de un pago',
    description: 'Acceso del pagador propietario, ADMIN o servicio con payments:read. Un pago ajeno se oculta como inexistente.',
  })
  @ApiParam({ name: 'id', required: true, description: 'UUID del pago.', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({
    status: 200,
    description: 'Estado del pago.',
    headers: { 'Cache-Control': { description: 'La respuesta no se almacena.', schema: { type: 'string', enum: ['no-store'] } } },
    content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentStatus' } } },
  })
  @ApiResponse({ status: 400, description: 'Identificador inválido.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 401, description: 'Autenticación requerida.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 403, description: 'Scope de servicio insuficiente.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  @ApiResponse({ status: 404, description: 'Pago inexistente o no visible.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } })
  async getStatus(
    @Param('id') id: string,
    @Req() request: PaymentReadRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GetPaymentStatusResponse> {
    const principal = request.paymentReadPrincipal;
    if (!principal) throw new DomainError('FORBIDDEN', 'Authenticated principal is missing');
    const status = await this.getPaymentStatus.execute(id, principal);
    response.setHeader('Cache-Control', 'no-store');
    return status;
  }
}
