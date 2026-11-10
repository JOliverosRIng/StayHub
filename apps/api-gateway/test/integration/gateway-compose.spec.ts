import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

/**
 * GW-063 — Verificación de la definición de despliegue del Gateway (Plan §7, constitución §V/§VII).
 *
 * No levanta contenedores (eso exige un daemon Docker, cubierto por GW-058–GW-060 en un entorno
 * real): audita de forma determinista los artefactos versionados que definen la imagen y el
 * servicio. Comprueba que:
 *  - `infra/docker/gateway/Dockerfile` es multi-stage, instala con `npm ci`, compila, corre como
 *    usuario NO root, expone únicamente 8080 y declara un healthcheck HTTPS.
 *  - `docker-compose.yml` publica SOLO el 8080 del Gateway, lo ata a `restart: always`, lo conecta a
 *    redes internas, monta los secretos TLS/Redis/service JWT y depende de Redis/Auth/Users sanos.
 *  - El Redis de borde no publica puertos, exige contraseña y tiene healthcheck.
 *  - `.dockerignore` excluye secretos, dependencias y artefactos de build.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const COMPOSE_PATH = join(REPO_ROOT, 'docker-compose.yml');
const DOCKERFILE_PATH = join(REPO_ROOT, 'infra', 'docker', 'gateway', 'Dockerfile');
const DOCKERIGNORE_PATH = join(REPO_ROOT, 'infra', 'docker', 'gateway', '.dockerignore');

interface ComposeService {
  readonly build?: { readonly context?: string; readonly dockerfile?: string; readonly target?: string };
  readonly image?: string;
  readonly command?: readonly string[];
  readonly environment?: Record<string, string>;
  readonly env_file?: string;
  readonly ports?: readonly string[];
  readonly networks?: readonly string[];
  readonly secrets?: readonly string[];
  readonly depends_on?: Record<string, { readonly condition?: string }>;
  readonly healthcheck?: { readonly test?: readonly string[] };
  readonly restart?: string;
}

interface ComposeDocument {
  readonly services: Record<string, ComposeService>;
  readonly networks: Record<string, { readonly internal?: boolean }>;
  readonly secrets: Record<string, { readonly file?: string }>;
}

const compose = YAML.parse(readFileSync(COMPOSE_PATH, 'utf8')) as ComposeDocument;
const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
const dockerignore = readFileSync(DOCKERIGNORE_PATH, 'utf8');

function service(name: string): ComposeService {
  const value = compose.services[name];
  if (value === undefined) throw new Error(`servicio ${name} ausente en docker-compose.yml`);
  return value;
}

describe('Runtime verificado de la imagen y Compose del Gateway (GW-063)', () => {
  describe('Dockerfile', () => {
    it('es multi-stage y construye con npm ci y el workspace del Gateway', () => {
      const stages = dockerfile.match(/^FROM\s+/gm) ?? [];

      expect(stages.length).toBeGreaterThanOrEqual(2);
      expect(dockerfile).toContain('RUN npm ci');
      expect(dockerfile).toContain('npm run build --workspace @stayhub/api-gateway');
      expect(dockerfile).toContain('node:20');
    });

    it('corre como usuario no root', () => {
      expect(dockerfile).toMatch(/^USER\s+stayhub$/m);
      expect(dockerfile).not.toMatch(/^USER\s+(root|0)$/m);
      expect(dockerfile).toContain('useradd --system');
    });

    it('expone solo el 8080 y declara healthcheck HTTPS sobre /health/live', () => {
      expect(dockerfile).toContain('EXPOSE 8080');
      expect(dockerfile).not.toMatch(/EXPOSE\s+(?!8080)\d+/);
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('https://127.0.0.1:8080/health/live');
    });

    it('.dockerignore excluye secretos, dependencias y artefactos de build', () => {
      for (const entry of ['node_modules/', '.git/', '.env*', 'coverage/', 'dist/']) {
        expect(dockerignore).toContain(entry);
      }
    });
  });

  describe('docker-compose.yml', () => {
    it('define api-gateway con la imagen del Gateway y target runtime', () => {
      const gateway = service('api-gateway');

      expect(gateway.build?.context).toBe('.');
      expect(gateway.build?.dockerfile).toBe('infra/docker/gateway/Dockerfile');
      expect(gateway.build?.target).toBe('runtime');
    });

    it('publica únicamente el 8080 del Gateway', () => {
      expect(service('api-gateway').ports).toEqual(['8080:8080']);
      for (const internal of ['auth-service', 'users-service', 'search-service']) {
        expect(service(internal).ports).toBeUndefined();
      }
    });

    it('usa restart: always y healthcheck HTTPS sobre el 8080', () => {
      const gateway = service('api-gateway');
      const command = (gateway.healthcheck?.test ?? []).join(' ');

      expect(gateway.restart).toBe('always');
      expect(command).toContain('https://127.0.0.1:8080/health/live');
    });

    it('se conecta a redes internas y monta los secretos TLS/Redis/service JWT', () => {
      const gateway = service('api-gateway');
      const networks = gateway.networks ?? [];

      expect(networks).toContain('stayhub-internal');
      expect(networks).toContain('stayhub-edge');
      expect(compose.networks['stayhub-internal']?.internal).toBe(true);
      expect(compose.networks['stayhub-edge']?.internal).toBe(true);

      expect(gateway.secrets).toEqual(
        expect.arrayContaining([
          'gateway_tls_cert',
          'gateway_tls_key',
          'gateway_redis_password',
          'gateway_service_private_key',
        ]),
      );
      for (const secret of gateway.secrets ?? []) {
        expect(compose.secrets[secret]?.file).toBeDefined();
      }
    });

    it('fuerza producción con TLS y depende de Redis, Auth y Users sanos', () => {
      const gateway = service('api-gateway');

      expect(gateway.environment?.['NODE_ENV']).toBe('production');
      expect(gateway.environment?.['GATEWAY_PROTOCOL']).toBe('https');
      expect(gateway.depends_on?.['gateway-redis']?.condition).toBe('service_healthy');
      expect(gateway.depends_on?.['auth-service']?.condition).toBe('service_healthy');
      expect(gateway.depends_on?.['users-service']?.condition).toBe('service_healthy');
    });

    it('el Redis de borde exige contraseña, tiene healthcheck y no publica puertos', () => {
      const redis = service('gateway-redis');

      expect(redis.ports).toBeUndefined();
      expect((redis.command ?? []).join(' ')).toContain('--requirepass');
      expect((redis.command ?? []).join(' ')).toContain('GATEWAY_REDIS_PASSWORD');
      expect(redis.healthcheck?.test?.join(' ')).toContain('ping');
      expect(redis.networks).toContain('stayhub-internal');
    });
  });
});
