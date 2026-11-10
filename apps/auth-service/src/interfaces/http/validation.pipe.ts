import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import type { FieldError } from './problem.mapper';

const CONSTRAINT_CODES: Readonly<Record<string, string>> = {
  whitelistValidation: 'unknown_field',
  forbidUnknownValues: 'unknown_shape',
  nestedValidation: 'nested_type_missing',
  isEmail: 'invalid_email',
  isString: 'not_a_string',
  isIn: 'not_an_allowed_value',
  isUuid: 'not_a_uuid',
  matches: 'malformed_value',
  minLength: 'too_short',
  maxLength: 'too_long',
  isNotEmpty: 'required',
};

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        errors: fieldErrors(errors),
      }),
  });
}

export function fieldErrors(
  errors: readonly ValidationError[],
  prefix = '',
): readonly FieldError[] {
  return errors.flatMap((error) => {
    // Never echo an unknown property name: it is attacker-controlled and may carry secrets.
    if (error.constraints?.whitelistValidation !== undefined) {
      return [{ field: 'body', code: 'unknown_field' }];
    }
    const field = prefix === '' ? error.property : `${prefix}.${error.property}`;
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({
      field,
      code: CONSTRAINT_CODES[constraint] ?? 'invalid',
    }));
    return [...own, ...fieldErrors(error.children ?? [], field)];
  });
}
