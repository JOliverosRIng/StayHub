import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { DomainError, type FieldError } from '../../domain/shared/domain-error';

function collectErrors(errors: readonly ValidationError[], prefix = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property || 'body';
    const ownErrors = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...ownErrors, ...collectErrors(error.children ?? [], field)];
  });
}

export class PaymentsValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors: ValidationError[]): DomainError =>
        new DomainError('VALIDATION_ERROR', 'Request validation failed', collectErrors(errors)),
    });
  }
}
