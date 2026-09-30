# PRE-001 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`. Estado: **Verificado localmente** (con una limitación de entorno: Node 22 en lugar de 20 y Docker ausente; se usó Podman).

Este plan encontró trabajo concurrente ya presente en el árbol (configureAuthHttp, trace middleware, módulos Core/ServiceAuth, helpers de test, compose.test.yml, separación cross-service, guardas de limpieza). Se reutilizó y verificó; no se reemplazó automáticamente. Se corrigieron dos defectos reales descubiertos al ejecutar build y arranque.

## Cambios realizados en esta ejecución

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/tsconfig.build.json` | Añadir `jest.cross-service.config.ts` al `exclude` | El build fallaba con `TS6059` porque `jest.cross-service.config.ts` (y, por su `import`, `jest.config.ts`) quedaba dentro del programa con `rootDir: src`. |
| `apps/auth-service/test/helpers/crypto-fixture.ts` | `argon2.timeCost` 1 → 2 | `argon2` rechaza `timeCost < 2` (`Invalid timeCost, must be between 2 and 4294967295`). El fixture declaraba una configuración inválida para cualquier suite que use el hasher real. |

## Trabajo concurrente verificado (no modificado)

- `configure-auth-http.ts` + `trace.middleware.ts` + `trace.interceptor.ts`: traceId se asigna antes de guards, con memoización (`ensureTraceId`) para no generar un segundo ID.
- `main.ts` y `test/helpers/auth-app.ts` usan `configureAuthHttp`.
- `modules/core/core.module.ts`: exporta `AUTH_CONFIG`/`AuthLogger`/`CLOCK`/`UUID_GENERATOR`/`ENTROPY_GENERATOR`.
- `modules/service-auth/service-auth.module.ts`: exporta verifier, guard, `UsersServiceTokenProvider`, `UsersServiceClient`.
- `app.module.ts`: importa y reexporta Core/ServiceAuth.
- Helpers: `crypto-fixture` (3 pares RSA efímeros + factory de service JWT), `fake-clock`, `users-stub` (HTTP en puerto efímero, fallo antes/después de mutar), `auth-app`.
- `compose.test.yml` (PostgreSQL 16 + Redis 7 en 127.0.0.1, credenciales sintéticas).
- `dependencies.setup.ts`: `assertSafeCleanupTargets` (opt-in `AUTH_TEST_ALLOW_CLEANUP=true`, DB `*_test`, Redis DB 15) y restauración de env.
- Separación cross-service: `jest.config.ts` ignora los patrones de AUTH-076–082; `jest.cross-service.config.ts` + `test:cross-service`.

## Evidencia de comandos

Ejecutado desde la raíz, con `npm ci` (811 paquetes) y `prisma:generate`:

```sh
npm run prisma:generate   # OK
npm run typecheck         # OK
npm run test:unit         # OK — 6 suites, 25 tests
npm run build             # OK
npm run lint              # OK
```

- Entrypoint emitido: `dist/apps/auth-service/main.js` (coincide con el `start` del workspace).
- Dockerfile: copia `dist/apps/auth-service` → `/app/dist` y usa `CMD ["node","dist/main.js"]`; coherente.

## Verificación de runtime (Podman, no Docker)

`docker` no está instalado; se usó `podman`/`podman-compose` con el mismo `compose.test.yml` (PostgreSQL 16 + Redis 7 reales).

- `prisma migrate deploy`: aplicadas `001_auth_registration` y `002_auth_sessions`.
- Arranque real de `node dist/apps/auth-service/main.js` con configuración sintética (claves RSA generadas con `openssl`, sin PEM versionados):
  - `GET /health/live` → `200 {"status":"ok"}`.
  - `GET /health/ready` → `200 {"status":"ready"}`.
  - `x-trace-id` presente y coherente con el `traceId` del Problem Details en una ruta sin controlador (`404`).
- Harness de integración probado con un spec temporal (eliminado): `createIntegrationDependencies()` conectó, `clean()` borró filas + `flushdb`, y `close()` restauró `AUTH_DATABASE_URL`/`AUTH_REDIS_URL`.
- `test:cross-service` sin providers: falla (exit 1). Con una suite cross-service presente, `test/cross-service/setup.ts` lanza el mensaje explícito solicitando `CROSS_SERVICE_PROVIDERS=true` y URLs.
- Patrones verificados con `--listTests`: `contract` local no toma `users-registration.consumer.spec.ts`; el config cross-service solo toma el archivo cross-service.

## Criterios de aceptación

- [x] Los tests existentes se ejecutan con dependencias instaladas; los helpers nuevos generan claves efímeras (no hay PEM versionados).
- [x] Un test de health y otro de rechazo previo al controlador comprueban traceId coherente usando `configureAuthHttp` (`test/unit/configure-auth-http.spec.ts`).
- [x] La limpieza sobre URL no test se rechaza antes de ejecutar SQL/`FLUSHDB` (`test/unit/test-cleanup-guard.spec.ts`).
- [x] Build y entrypoint probados. La limitación de entorno (Docker ausente, Node 22) se reporta abajo.

## Limitaciones y bloqueos externos

- **Node 22.22.2** en lugar de 20 (los `engines` exigen `>=20 <21`). `npm ci`, typecheck, tests, build y lint pasaron igualmente; npm solo emitió avisos. No se probó con Node 20 real.
- **Docker no instalado.** La verificación de contenedores se hizo con Podman y el mismo compose; el `Dockerfile` no se construyó.
- El entrypoint se arrancó con configuración sintética fuera de `.env`; no se validó el despliegue Docker completo (AUTH-082).

## Hallazgos fuera del alcance de PRE-001 (para otros planes)

- `auth-config.ts` valida `AUTH_ARGON2_TIME_COST` desde 1, pero `argon2` exige `>=2`; un valor 1 pasa la config y revienta el arranque al construir `Argon2PasswordHasher` (observado). `memoryCost` mínimo de argon2 es 1024 y la config permite 8192. Candidato para AUTH-033/AUTH-083.
- `USERS_SERVICE` sigue sin provider; corresponde a AUTH-041.
- Sin controladores de Auth todavía: las rutas internas devuelven 404 (esperado en PRE-001).
