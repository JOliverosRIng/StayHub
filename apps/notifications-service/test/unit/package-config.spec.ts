import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ServicePackage {
  name: string;
  scripts: Record<string, string>;
}

interface ServiceTsConfig {
  compilerOptions: {
    paths: Record<string, string[]>;
  };
}

describe('notifications-service package configuration (NTF-001)', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
  ) as ServicePackage;
  const tsconfig = JSON.parse(
    readFileSync(resolve(__dirname, '../../tsconfig.json'), 'utf8'),
  ) as ServiceTsConfig;

  it('declares the local service scripts without relying on root scripts', () => {
    expect(packageJson.name).toBe('@stayhub/notifications-service');
    for (const script of [
      'test',
      'test:unit',
      'test:integration',
      'test:contract',
      'test:security',
      'lint',
      'typecheck',
    ]) {
      expect(packageJson.scripts[script]).toEqual(expect.any(String));
    }
  });

  it('maps the service alias to its own source tree', () => {
    expect(tsconfig.compilerOptions.paths['@notifications/*']).toEqual([
      'apps/notifications-service/src/*',
    ]);
  });
});
