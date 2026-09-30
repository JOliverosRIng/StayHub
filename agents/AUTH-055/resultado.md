# AUTH-055 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra referencia test-local; implementación productiva pendiente en AUTH-067)**.

Dependencias leídas: PRE-003 (verificada localmente). Reglas aplicadas: D01–D06, D08–D10.

## Objetivo

Acreditar sobre PostgreSQL real la rotación de refresh, la detección de replay y la concurrencia, usando el
`PrismaSessionUnitOfWork` productivo (PRE-003) y una **referencia** test-local de la rotación D04.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/helpers/reference-refresh-rotation.ts` | **Nuevo**. `ReferenceRotateRefreshTokenService` (referencia del futuro `RotateRefreshTokenUseCase`, AUTH-067), `createHmacRefreshTokenCodec` (HMAC-SHA256 → 64 hex) y `StubAccessTokenSigner`. | No existe el caso de uso productivo; la referencia implementa D04 sobre el UoW real y se sustituye en AUTH-067. |
| `apps/auth-service/test/integration/refresh-rotation.spec.ts` | **Nuevo**. 10 pruebas con dos conexiones `PrismaService`, PostgreSQL real y barrera. | Rotación, replay, rollback y concurrencia. |

No se modificó código productivo.

## Cobertura de la matriz

- **Rotación:** el token viejo queda `CONSUMED` con `consumedAt`, enlaza a un único sucesor `ACTIVE`, el
  `expiresAt` del sucesor es exactamente login+7d y la sesión incrementa su `version` sin cambiar rol ni
  expiración. Se guarda solo el HMAC-SHA256 (64 hex), nunca el raw.
- **Inválidos:** token desconocido, revocado, vencido (sesión activa) y token de sesión revocada → `invalid`,
  sin sucesor.
- **Replay (familia):** reutilizar un token ya consumido tras varias rotaciones revoca la sesión con
  `REFRESH_REUSE` y deja 0 tokens `ACTIVE`; otra sesión del mismo usuario permanece activa.
- **Commit del replay:** el caller recibe `RefreshTokenInvalidError` (401) pero la revocación queda confirmada
  en PostgreSQL.
- **Rollback:** fallo de firma y fallo posterior al `insertSuccessor` revierten todo (token original sigue
  `ACTIVE`, versión de sesión intacta, sin sucesor).
- **Concurrencia (barrera, dos conexiones):** de dos rotaciones simultáneas del mismo raw, exactamente una
  rota y la otra detecta replay; la sesión queda revocada y 0 `ACTIVE`.

## Evidencia de comandos

Postgres 16 / Redis 7 de `infra/docker/auth/compose.test.yml` (Podman, ya arriba y healthy).

```sh
npm run typecheck   # OK
npm run lint        # OK
TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/refresh-rotation.spec.ts   # 10/10
```

Proyecto de integración completo: **7 suites, 58 tests, 0 fallos**.

## Criterios de aceptación

- [x] No se usa mock de Prisma ni `sleep` como sincronización (la barrera es lógica con locks reales).
- [x] La prueba diferencia rollback técnico del commit de revocación (replay).
- [x] No aparece un segundo refresh `ACTIVE` por sesión.

## Pendiente / handoff

- **AUTH-067:** sustituir `ReferenceRotateRefreshTokenService` por el caso de uso productivo e invalidar la
  caché de sesión best-effort; la referencia no toca Redis.
- **AUTH-057/068:** validación/introspección con caché real y `stale` nunca autoritativa (aquí solo se
  certifica la fuente PostgreSQL).
- Sin cambios productivos pendientes de este plan.
