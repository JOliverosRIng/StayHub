import { BadRequestException, Injectable, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

@Injectable()
export class ClosedValidationPipe extends ValidationPipe {
  public constructor() {
    super({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
      exceptionFactory: (errors: ValidationError[]) => new BadRequestException({ code: 'VALIDATION_ERROR', errors: errors.map((e) => ({ field: e.property, constraints: e.constraints })) }),
    });
  }
}
