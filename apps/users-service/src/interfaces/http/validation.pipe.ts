import { ValidationPipe } from '@nestjs/common';
import { DomainError } from '@users/domain/shared/domain-error';
const fields = new Set(['name', 'email', 'role', 'phone', 'preferences', 'photo', 'expectedVersion', 'userId', 'registrationId', 'profile']);
export const validationPipe = new ValidationPipe({
  transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: (errors): DomainError => new DomainError('VALIDATION_ERROR', errors.map((e) => ({ field: fields.has(e.property) ? e.property : 'body', code: 'INVALID_VALUE' }))),
});
