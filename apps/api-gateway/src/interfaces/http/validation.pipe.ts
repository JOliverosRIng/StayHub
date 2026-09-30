import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError, type ValidatorOptions } from 'class-validator';

import type { FieldError } from '@gateway/interfaces/http/problem.mapper';

export const VALIDATION_FAILED = 'VALIDATION_FAILED';
const BODY_MUST_BE_OBJECT = 'The request body must be a JSON object';

const CONSTRAINT_CODES: Readonly<Record<string, string>> = {
  whitelistValidation: 'unknown_field',
  forbidUnknownValues: 'unknown_shape',
  nestedValidation: 'nested_type_missing',
  isEmail: 'invalid_email',
  isString: 'not_a_string',
  isInt: 'not_an_integer',
  isNumber: 'not_a_number',
  isBoolean: 'not_a_boolean',
  isUuid: 'not_a_uuid',
  isUrl: 'not_a_url',
  isIn: 'not_an_allowed_value',
  matches: 'malformed_value',
  equals: 'must_match',
  minLength: 'too_short',
  maxLength: 'too_long',
  arrayMinSize: 'too_few_items',
  arrayMaxSize: 'too_many_items',
};

const OPTIONS: ValidatorOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
};

@Injectable()
export class GatewayValidationPipe implements PipeTransform<unknown, unknown> {
  public transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!isPlainObject(value)) throw validationFailed([], BODY_MUST_BE_OBJECT);
    const metatype = metadata.metatype;
    if (metatype === undefined || metatype === Object) return value;
    const instance = plainToInstance(metatype as new () => object, value, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(instance, OPTIONS);
    if (errors.length > 0) throw validationFailed(fieldErrors(errors));
    return instance;
  }
}

export function validationFailed(
  errors: readonly FieldError[],
  detail?: string,
): BadRequestException {
  return new BadRequestException({
    code: VALIDATION_FAILED,
    message: detail ?? 'The request body contains invalid or unknown fields',
    errors,
  });
}

export function fieldErrors(
  errors: readonly ValidationError[],
  prefix = '',
): readonly FieldError[] {
  const output: FieldError[] = [];
  for (const error of errors) {
    const field = prefix === '' ? error.property : `${prefix}.${error.property}`;
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      output.push({ field, code: codeFor(constraint, message) });
    }
    if (error.children !== undefined && error.children.length > 0) {
      output.push(...fieldErrors(error.children, field));
    }
  }
  return output;
}

function codeFor(constraint: string, message: string): string {
  if (constraint === 'length') return message.includes('shorter') ? 'too_short' : 'too_long';
  return CONSTRAINT_CODES[constraint] ?? 'invalid';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
