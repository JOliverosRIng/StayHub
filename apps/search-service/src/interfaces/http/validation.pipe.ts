import { BadRequestException, ValidationPipe } from '@nestjs/common';
export function createSearchValidationPipe(): ValidationPipe {
  return new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, stopAtFirstError: false, exceptionFactory: (errors) => new BadRequestException({ code: 'SEARCH_VALIDATION_FAILED', errors }) });
}
