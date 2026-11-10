import {
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
  getSchemaPath,
  type ApiResponseOptions,
} from '@nestjs/swagger';

@ApiSchema({ name: 'FieldError' })
export class FieldErrorResponse {
  @ApiProperty()
  public readonly field!: string;

  @ApiProperty()
  public readonly code!: string;

  @ApiPropertyOptional()
  public readonly message?: string;
}

@ApiSchema({ name: 'Problem' })
export class ProblemResponse {
  @ApiProperty({ format: 'uri-reference' })
  public readonly type!: string;

  @ApiProperty()
  public readonly title!: string;

  @ApiProperty({ type: 'integer' })
  public readonly status!: number;

  @ApiProperty()
  public readonly detail!: string;

  @ApiProperty()
  public readonly instance!: string;

  @ApiProperty()
  public readonly code!: string;

  @ApiProperty()
  public readonly traceId!: string;

  @ApiPropertyOptional({ type: [FieldErrorResponse] })
  public readonly errors?: readonly FieldErrorResponse[];
}

export function problemResponse(
  status: number,
  description: string,
  headers?: ApiResponseOptions['headers'],
): ApiResponseOptions {
  return {
    status,
    description,
    ...(headers === undefined ? {} : { headers }),
    content: {
      'application/problem+json': { schema: { $ref: getSchemaPath(ProblemResponse) } },
    },
  };
}
