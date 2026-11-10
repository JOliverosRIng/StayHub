import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface ValidationProblemItem {
  field: string;
  code: string;
}

function constraintCode(constraint: string): string {
  return `VALIDATION_${constraint.replace(/([a-z])([A-Z])/gu, '$1_$2').toUpperCase()}`;
}

export function mapValidationErrors(
  errors: readonly ValidationError[],
  parent = '',
): ValidationProblemItem[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({
      field,
      code: constraintCode(constraint),
    }));
    return [...own, ...mapValidationErrors(error.children ?? [], field)];
  });
}

export class ClosedValidationPipe extends ValidationPipe {
  public constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: false,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new BadRequestException({ code: 'VALIDATION_ERROR', errors: mapValidationErrors(errors) }),
    });
  }
}
