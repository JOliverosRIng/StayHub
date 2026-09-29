import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const GATEWAY_ROOT = join(REPO_ROOT, 'apps', 'api-gateway');

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

const rootPackage = readJson(join(REPO_ROOT, 'package.json'));
const rootScripts = rootPackage.scripts as Record<string, string>;
const baseTsconfig = readJson(join(REPO_ROOT, 'tsconfig.base.json'));
const gatewayPackage = readJson(join(GATEWAY_ROOT, 'package.json'));

const GATEWAY_LAYER_ALIASES = [
  '@gateway/application/*',
  '@gateway/infrastructure/*',
  '@gateway/interfaces/*',
  '@gateway/modules/*',
] as const;

describe('Registro del workspace api-gateway (GW-001, GW-003)', () => {
  it('el workspace raiz declara apps/* para que G2 entre sin editar package.json', () => {
    expect(rootPackage.workspaces).toEqual(['apps/*']);
  });

  it('expone scripts con espacio de nombres para el gateway', () => {
    for (const script of ['build', 'lint', 'typecheck', 'test']) {
      expect(rootScripts[`${script}:gateway`]).toBe(
        `npm run ${script} --workspace @stayhub/api-gateway`,
      );
    }
  });

  it('los agregados de raiz ejecutan gateway y auth', () => {
    expect(rootScripts.build).toBe('npm run build:gateway && npm run build:auth');
    expect(rootScripts.typecheck).toBe(
      'npm run typecheck:gateway && npm run typecheck:auth',
    );
  });

  it('declara los cuatro aliases por capa y ninguno de dominio', () => {
    const paths = (baseTsconfig.compilerOptions as Record<string, unknown>).paths as Record<
      string,
      string[]
    >;

    for (const alias of GATEWAY_LAYER_ALIASES) {
      expect(paths[alias]).toEqual([`apps/api-gateway/src/${alias.split('/')[1]!.replace('/*', '')}/*`]);
    }
    expect(Object.keys(paths).some((key) => key.startsWith('@gateway/domain'))).toBe(false);
  });

  it('conserva los alias de Auth en la raiz unificada', () => {
    const paths = (baseTsconfig.compilerOptions as Record<string, unknown>).paths as Record<
      string,
      string[]
    >;

    expect(paths['@auth/domain/*']).toEqual(['apps/auth-service/src/domain/*']);
    expect(paths['@auth/modules/*']).toEqual(['apps/auth-service/src/modules/*']);
  });

  it('el paquete del gateway usa el namespace y el rango de Node del monorepo', () => {
    expect(gatewayPackage.name).toBe('@stayhub/api-gateway');
    expect(gatewayPackage.engines).toEqual(rootPackage.engines);
    expect((rootPackage.engines as Record<string, string>).node).toBe('>=20 <21');
  });

  it('expone los cuatro comandos exigidos por GW-001', () => {
    const scripts = gatewayPackage.scripts as Record<string, string>;

    for (const script of ['build', 'lint', 'typecheck', 'test']) {
      expect(typeof scripts[script]).toBe('string');
    }
  });

  it('expone un proyecto por cada suite de GW-004', () => {
    const scripts = gatewayPackage.scripts as Record<string, string>;

    for (const suite of ['unit', 'integration', 'contract', 'e2e', 'performance', 'security']) {
      expect(scripts[`test:${suite}`]).toBe(`jest --selectProjects ${suite} --runInBand`);
    }
  });
});
