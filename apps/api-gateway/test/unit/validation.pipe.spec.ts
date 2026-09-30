import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, ValidateNested } from 'class-validator';

import { GatewayValidationPipe } from '@gateway/interfaces/http/validation.pipe';

class RegistroDto {
  @IsEmail()
  public email!: string;

  @IsString()
  @Length(8, 128)
  public password!: string;

  @IsOptional()
  @IsString()
  public alias?: string;
}

class SoloAliasDto {
  @IsString()
  public alias!: string;
}

class ContactoDto {
  @IsEmail()
  public email!: string;
}

class AnidadoDto {
  @ValidateNested()
  @Type(() => ContactoDto)
  public contacto!: ContactoDto;
}

const metadata = (metatype: new () => object): ArgumentMetadata =>
  ({ type: 'body', metatype }) as ArgumentMetadata;

const pipe = new GatewayValidationPipe();

interface CapturedError {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
}

const capture = async (run: () => unknown): Promise<CapturedError> => {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const response = error.getResponse();
    return typeof response === 'object' && response !== null
      ? (response as CapturedError)
      : {};
  }
  throw new Error('se esperaba un BadRequestException');
};

describe('GatewayValidationPipe (GW-011)', () => {
  it('acepta un cuerpo valido y devuelve la instancia del DTO', () => {
    const body = { email: 'ana@stayhub.example', password: 'segura123' };

    const result = pipe.transform(body, metadata(RegistroDto));

    expect(result).toBeInstanceOf(RegistroDto);
    expect((result as RegistroDto).email).toBe('ana@stayhub.example');
  });

  it('rechaza un campo desconocido sin aplicar cambios (FR-019)', () => {
    const body = { email: 'ana@stayhub.example', password: 'segura123', rol: 'ADMIN' };

    expect(() => pipe.transform(body, metadata(RegistroDto))).toThrow(BadRequestException);
  });

  it('identifica el campo desconocido en errors con field y code', async () => {
    const body = { email: 'ana@stayhub.example', password: 'segura123', rol: 'ADMIN' };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.errors).toContainEqual(
      expect.objectContaining({ field: 'rol', code: 'unknown_field' }),
    );
  });

  it('rechaza un email con formato invalido', async () => {
    const body = { email: 'no-es-un-email', password: 'segura123' };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    expect(error.errors).toContainEqual(
      expect.objectContaining({ field: 'email', code: 'invalid_email' }),
    );
  });

  it('rechaza una contrasena mas corta que 8 caracteres', async () => {
    const body = { email: 'ana@stayhub.example', password: 'corta' };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    expect(error.errors).toContainEqual(expect.objectContaining({ field: 'password' }));
  });

  it('rechaza una contrasena mas larga que 128 caracteres', async () => {
    const body = { email: 'ana@stayhub.example', password: 'a'.repeat(129) };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    expect(error.errors).toContainEqual(expect.objectContaining({ field: 'password' }));
  });

  it('acepta una contrasena de exactamente 8 y de exactamente 128 caracteres', () => {
    const base = 'ana@stayhub.example';

    expect(pipe.transform({ email: base, password: 'a'.repeat(8) }, metadata(RegistroDto))).toBeInstanceOf(
      RegistroDto,
    );
    expect(
      pipe.transform({ email: base, password: 'a'.repeat(128) }, metadata(RegistroDto)),
    ).toBeInstanceOf(RegistroDto);
  });

  it('evalua la contrasena exactamente como fue introducida, sin recorte ni normalizacion (FR-003)', () => {
    const password = '  SeGuRa123  ';

    const result = pipe.transform(
      { email: 'ana@stayhub.example', password },
      metadata(RegistroDto),
    );

    expect((result as RegistroDto).password).toBe(password);
  });

  it('no incluye en el error el valor de la contrasena rechazada (FR-024)', async () => {
    const body = { email: 'ana@stayhub.example', password: '  CORTO' };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    expect(JSON.stringify(error)).not.toContain('CORTO');
  });

  it('no incluye en el error el valor de un email rechazado (FR-024)', async () => {
    const body = { email: 'ana@stayhub.example', password: 'segura123', alias: 42 };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    expect(JSON.stringify(error)).not.toContain('segura123');
  });

  it('deja pasar el cuerpo sin metatipo sin lanzar', () => {
    const body = { cualquiera: 'cosa' };

    expect(pipe.transform(body, { type: 'body', metatype: undefined } as ArgumentMetadata)).toEqual(
      body,
    );
  });

  it('rechaza un cuerpo que no es objeto', () => {
    expect(() => pipe.transform('texto', metadata(RegistroDto))).toThrow(BadRequestException);
  });

  it('rechaza un cuerpo array', () => {
    expect(() => pipe.transform([], metadata(RegistroDto))).toThrow(BadRequestException);
  });

  it('enumera todos los campos que requieren correccion, no solo el primero', async () => {
    const body = { email: 'no-es-un-email', password: 'corta' };

    const error = await capture(() => pipe.transform(body, metadata(RegistroDto)));

    const fields = (error.errors as { field: string }[]).map((entry) => entry.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rechaza un tipo incorrecto en un campo declarado', async () => {
    const error = await capture(() => pipe.transform({ alias: 42 }, metadata(SoloAliasDto)));

    expect(error.errors).toContainEqual(
      expect.objectContaining({ field: 'alias', code: 'not_a_string' }),
    );
  });

  it('une con punto la ruta de un error anidado', async () => {
    const body = { contacto: { email: 42 } };

    const error = await capture(() => pipe.transform(body, metadata(AnidadoDto)));

    expect(error.errors).toContainEqual(
      expect.objectContaining({ field: 'contacto.email' }),
    );
  });

  it('reporta como desconocido un campo anidado no declarado', async () => {
    const body = { contacto: { email: 'a@b.example', telefono: '600' } };

    const error = await capture(() => pipe.transform(body, metadata(AnidadoDto)));

    expect(error.errors).toContainEqual(
      expect.objectContaining({ field: 'contacto.telefono', code: 'unknown_field' }),
    );
  });
});
