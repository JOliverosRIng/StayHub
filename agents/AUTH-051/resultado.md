# AUTH-051 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra fixture; ruta productiva ausente)**.

Dependencias leídas: PRE-001, PRE-004 (ambas verificadas localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Preparar la suite de contrato HTTP de introspección (`POST /internal/v1/sessions/validate`) antes de que
exista `SessionsController` (AUTH-071), con evidencia GREEN contra un fixture test-local y la ausencia de
ruta productiva registrada como RED.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/contract/session-validation.contract.spec.ts` | **Nuevo**. Suite de contrato con `ValidateFixtureController` test-local, doble tipado de `VALIDATE_SESSION_USE_CASE`, `ServiceAuthGuard`/pipe/filtro reales, `ServiceJwtVerifier` real y claves RSA efímeras. | No existe aún el controlador productivo; el fixture sostiene la matriz y se sustituye por `SessionsController` en AUTH-071. |

No se modificó código productivo ni `auth-app.ts`. El fixture vive solo en `test/`.

## Cobertura de la matriz

- **Ruta ausente (RED documentado):** contra la composición de producción (sin el fixture) `POST` devuelve 404.
- **Happy path:** 200 con **exactamente** `{ active: true, role }` para `GUEST`, `OWNER` y `ADMIN`; sin `userId`
  ni `sessionId` en la respuesta; `execute` recibe `{ sessionId, userId, traceId }` y **no** recibe
  `accessTokenExpiresAt` (la ruta HTTP no transporta `exp`).
- **400 (10 casos) antes del caso de uso:** falta `sessionId`/`userId`; UUID malformados; `sessionId` `null`;
  campos `role`, `sid`, `accessToken`, `exp` o desconocidos. No acepta identidad alternativa.
- **401 genérico:** sesión inexistente, revocada, vencida o con `userId` distinto → `SESSION_INVALID`, cuerpo
  idéntico; no produce `active:false` 200 ni 403 por mismatch interno.
- **503:** fallo de base de datos → `DEPENDENCY_UNAVAILABLE` (Redis se cubre en AUTH-057).
- **401 service JWT (7 casos):** sin bearer; firma con clave foránea; issuer/audience/scope incorrectos;
  token vencido; el rechazo no invoca el caso de uso.

## Evidencia de comandos

Ejecutado desde la raíz del monorepo:

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/session-validation.contract.spec.ts
```

Resultado de la suite: **1 suite, 23 tests: 23 pasan**. La única conducta aún ausente es la ruta productiva,
documentada por el caso 404.

## Criterios de aceptación

- [x] La respuesta no devuelve sesión completa, `userId` ni datos de Users.
- [x] El POST interno y el body actuales se conservan (no se acepta `accessToken` ni `exp`).

## Pendiente / handoff

- **AUTH-071:** reemplazar `ValidateFixtureController` por `SessionsController`, sustituir el 404 por la ruta real.
- **AUTH-057:** cubrir sobre PostgreSQL/Redis reales la sesión vencida/revocada y una caché obsoleta.
- **AUTH-068:** implementar la introspección autoritativa que el fixture simula (`SessionInvalidError`).
- **AUTH-073:** documentar el 400 observable en el contrato/Swagger.
- Sin bloqueos de infraestructura: la suite es de contrato y no requiere PostgreSQL/Redis.
