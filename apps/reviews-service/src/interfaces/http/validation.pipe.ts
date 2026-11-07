import { BadRequestException, ValidationPipe } from '@nestjs/common';

export class ClosedValidationPipe extends ValidationPipe {
  public constructor() {
    super({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, stopAtFirstError: false, exceptionFactory: (errors) => new BadRequestException({ code: 'VALIDATION_ERROR', errors }) });
  }
}
