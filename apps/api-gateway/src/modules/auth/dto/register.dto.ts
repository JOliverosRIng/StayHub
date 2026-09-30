import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * GW-026 — DTO público cerrado para `POST /api/v1/auth/register` (FR-001–FR-003).
 *
 * Alineado con `RegisterRequest` de `openapi-public.yaml` y el contrato de GW-023. La validación
 * y el rechazo de campos desconocidos/restringidos los aplica el `GatewayValidationPipe` de
 * GW-011 (`whitelist` + `forbidNonWhitelisted`), que produce un 400 en Problem Details; aquí no
 * se crea validación paralela.
 *
 * La contraseña NO se normaliza ni transforma: no lleva `@Transform`, y el pipe usa
 * `plainToInstance` con `enableImplicitConversion: false`, de modo que se evalúa exactamente como
 * llega (sin trim, sin lowercase, sin normalización Unicode).
 */

export const PUBLIC_REGISTRATION_ROLES = ['GUEST', 'OWNER'] as const;

export type PublicRegistrationRole = (typeof PUBLIC_REGISTRATION_ROLES)[number];

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  public readonly name!: string;

  @IsEmail()
  @MaxLength(254)
  public readonly email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public readonly password!: string;

  @IsIn(PUBLIC_REGISTRATION_ROLES)
  public readonly role!: PublicRegistrationRole;
}
