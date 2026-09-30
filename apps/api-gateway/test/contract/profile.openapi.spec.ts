import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

import {
  GET_PHOTO_OPERATION_ID,
  GET_PHOTO_RESPONSE_CODES,
  GET_PROFILE_OPERATION_ID,
  GET_PROFILE_RESPONSE_CODES,
  BEARER_SCHEME,
  PHOTO_MAX_BYTES,
  PHOTO_MEBIBYTES,
  PREFERENCES_MAX,
  PROFILE_PATCH_SCHEMA,
  PROFILE_SCHEMA,
  UPDATE_PROFILE_OPERATION_ID,
  UPDATE_PROFILE_RESPONSE_CODES,
} from '@gateway/interfaces/openapi/profile.openapi';

/**
 * GW-049 — Verifica que `profile.openapi.ts` esté sincronizado 1:1 con las operaciones de perfil
 * y foto de `contracts/openapi-public.yaml` (fuente), incluido el límite decimal único de la foto.
 */

interface RefOrSchema {
  readonly $ref?: string;
  readonly type?: string;
  readonly format?: string;
  readonly description?: string;
  readonly maxProperties?: number;
}

interface SchemaView {
  readonly additionalProperties?: unknown;
  readonly required?: readonly string[];
  readonly maxProperties?: number;
  readonly properties?: Record<string, RefOrSchema>;
}

interface OperationView {
  readonly operationId?: string;
  readonly security?: readonly Record<string, unknown>[];
  readonly requestBody?: {
    readonly content: Record<
      string,
      { readonly schema: { readonly properties?: Record<string, RefOrSchema> } }
    >;
  };
  readonly responses: Record<string, unknown>;
}

interface DocView {
  readonly paths: Record<string, { readonly get?: OperationView; readonly patch?: OperationView }>;
  readonly components: { readonly schemas: Record<string, SchemaView> };
}

const CONTRACT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'specs',
  '001-fundamentos-identidad',
  'contracts',
  'openapi-public.yaml',
);

const rawContract = readFileSync(CONTRACT, 'utf8');
const doc = YAML.parse(rawContract) as DocView;
const getProfile = doc.paths['/users/{userId}/profile']?.get;
const patchProfile = doc.paths['/users/{userId}/profile']?.patch;
const getPhoto = doc.paths['/users/{userId}/profile/photo']?.get;

function codesOf(operation: OperationView | undefined): number[] {
  return Object.keys(operation?.responses ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

function schemeNames(operation: OperationView | undefined): string[] {
  return (operation?.security ?? []).flatMap((requirement) => Object.keys(requirement));
}

describe('Sincronización OpenAPI de perfil (GW-049)', () => {
  it('documenta las tres operaciones con sus operationId y bearer', () => {
    expect(getProfile?.operationId).toBe(GET_PROFILE_OPERATION_ID);
    expect(patchProfile?.operationId).toBe(UPDATE_PROFILE_OPERATION_ID);
    expect(getPhoto?.operationId).toBe(GET_PHOTO_OPERATION_ID);
    expect(schemeNames(getProfile)).toContain(BEARER_SCHEME);
    expect(schemeNames(patchProfile)).toContain(BEARER_SCHEME);
    expect(schemeNames(getPhoto)).toContain(BEARER_SCHEME);
  });

  it('conserva los estados de cada operación alineados con profile.openapi.ts', () => {
    expect(codesOf(getProfile)).toEqual([...GET_PROFILE_RESPONSE_CODES].sort((a, b) => a - b));
    expect(codesOf(patchProfile)).toEqual([...UPDATE_PROFILE_RESPONSE_CODES].sort((a, b) => a - b));
    expect(codesOf(getPhoto)).toEqual([...GET_PHOTO_RESPONSE_CODES].sort((a, b) => a - b));
  });

  it('el PATCH es multipart con parte profile (ProfilePatch) y foto binaria', () => {
    const multipart = patchProfile?.requestBody?.content['multipart/form-data']?.schema;
    expect(multipart?.properties?.['profile']?.$ref).toBe('#/components/schemas/ProfilePatch');
    expect(multipart?.properties?.['photo']?.format).toBe('binary');
  });

  it('declara el límite de foto EXACTO de 5.000.000 bytes decimales, único (no 5 MiB)', () => {
    expect(PHOTO_MAX_BYTES).toBe(5_000_000);
    expect(PHOTO_MAX_BYTES).not.toBe(PHOTO_MEBIBYTES);

    const photoDescription =
      patchProfile?.requestBody?.content['multipart/form-data']?.schema.properties?.['photo']
        ?.description ?? '';
    expect(photoDescription).toContain('5,000,000');
    // El contrato no menciona en ningún sitio el valor de 5 MiB.
    expect(rawContract).not.toContain('5242880');
    expect(rawContract).not.toContain('5,242,880');
  });

  it('Profile y ProfilePatch del contrato coinciden 1:1 con profile.openapi.ts', () => {
    const yamlProfile = doc.components.schemas['Profile'];
    const constProfile = PROFILE_SCHEMA as unknown as SchemaView;
    expect(yamlProfile?.additionalProperties).toBe(false);
    expect([...(yamlProfile?.required ?? [])].sort()).toEqual(
      ['email', 'id', 'name', 'role', 'version'],
    );
    expect([...(constProfile.required ?? [])].sort()).toEqual(
      ['email', 'id', 'name', 'role', 'version'],
    );

    const yamlPatch = doc.components.schemas['ProfilePatch'];
    const constPatch = PROFILE_PATCH_SCHEMA as unknown as SchemaView;
    expect(yamlPatch?.additionalProperties).toBe(false);
    expect([...(yamlPatch?.required ?? [])]).toEqual(['expectedVersion']);
    expect([...(constPatch.required ?? [])]).toEqual(['expectedVersion']);

    const yamlPreferences = doc.components.schemas['Preferences'];
    expect(yamlPreferences?.maxProperties).toBe(PREFERENCES_MAX);
    expect(constPatch.properties?.['preferences']?.maxProperties).toBe(PREFERENCES_MAX);
  });
});
