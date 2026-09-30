import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: flattenValidationErrors(errors),
      }),
  });
}

function flattenValidationErrors(errors: readonly ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    if (error.constraints?.whitelistValidation !== undefined) {
      return ['body: unknown property is not allowed'];
    }
    const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
    const own = Object.values(error.constraints ?? {}).map((message) => `${path}: ${message}`);
    return [...own, ...flattenValidationErrors(error.children ?? [], path)];
  });
}

