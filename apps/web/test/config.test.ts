// @vitest-environment node
// vite.config imports esbuild, which requires Node's own TextEncoder/Uint8Array (not jsdom's).
import { describe, expect, it } from 'vitest';
import { assertProductionApiBaseUrl } from '../vite.config';

describe('production API base URL', () => {
  it.each([undefined, '', '   '])('fails clearly when missing (%j)', (value) => {
    expect(() => assertProductionApiBaseUrl(value)).toThrow(/VITE_API_BASE_URL es obligatoria/);
  });

  it('rejects plain http in production', () => {
    expect(() => assertProductionApiBaseUrl('http://gateway.example/api/v1')).toThrow(/https/);
  });

  it.each(['/api/v1', 'https://gateway.example/api/v1'])('accepts %s', (value) => {
    expect(() => assertProductionApiBaseUrl(value)).not.toThrow();
  });
});
