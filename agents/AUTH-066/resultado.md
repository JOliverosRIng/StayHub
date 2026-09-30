# AUTH-066 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: PRE-003 (verificada local) y AUTH-053 (implementada local). Reglas aplicadas: D01,
D02, D04–D06, D08–D10.

## Objetivo

Crear el emisor productivo de pares de tokens (login y rotación): genera el refresh con 32 bytes de
entropía, persiste solo su HMAC-SHA256 y firma el access JWT con los claims mínimos y el rol de la sesión,
compartiendo la misma regla de expiración absoluta (7 días) sin duplicar lógica.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/application/ports/refresh-token-codec.port.ts` | **Nuevo.** `REFRESH_TOKEN_CODEC` + `RefreshTokenCodec {generateRawToken,hash}`. | La aplicación solo conoce el puerto, no `node:crypto`. |
| `src/infrastructure/security/hmac-refresh-token.codec.ts` | **Nuevo.** `HmacRefreshTokenCodec`: `randomBytes(32).toString('base64url')` y `createHmac('sha256', refreshTokenHmacSecret)` hex; valida secreto ≥32. | Implementación del puerto con el secreto existente. |
| `src/application/sessions/issue-session-tokens.service.ts` | **Nuevo.** `ISSUE_SESSION_TOKENS`, `SessionTokensIssuer`, `IssueSessionTokensService`: `issueNewSession(userId, role)` (UUID + Clock + `Session.create` 604800) e `issueForSession(session)` (recibe la sesión, no la recrea ni consulta Users), sobre un único `issueTokens` compartido. | Emisor reutilizable por login y rotación. |
| `src/application/ports/index.ts` | Exporta `refresh-token-codec.port`. | Disponibilidad del puerto. |
| `test/unit/issue-session-tokens.spec.ts` | **Nuevo.** 12 pruebas con codec real, firmante RS256 real y `FakeClock`. | Evidencia de entropía, HMAC, expiraciones y claims. |

No se modificaron módulos Nest: AUTH-072 compondrá `HmacRefreshTokenCodec` y `IssueSessionTokensService`.

## Comportamiento verificado

- **Entropía:** `generateRawToken` produce 32 bytes (`base64url`) y tokens distintos por llamada.
- **HMAC:** `hash` estable de 64 hex para el mismo raw/secreto y distinto con otro secreto; nunca igual al raw.
- **Sesión nueva:** UUID, rol, `absoluteExpiresAt = now + 604800s`; refresh ACTIVE con `expiresAt` idéntico
  al de la sesión y `tokenHash = codec.hash(raw)`.
- **Access:** verificado con `Rs256TokenService` real: `sub/sid/role/jti` correctos, `exp - iat = 3600`,
  sin `email`/`name` y con el conjunto canónico de claims (`aud,exp,iat,iss,jti,role,sid,sub`).
- **Rotación:** `issueForSession` no recrea la sesión, conserva `absoluteExpiresAt` original, usa el rol de
  la sesión y emite IDs/jti/raw nuevos en cada llamada.
- **Frontera día 7:** cerca del vencimiento el access sigue siendo de 3600 s y el refresh conserva la
  expiración absoluta; con la sesión ya vencida se rechaza (`RefreshToken` exige `expiresAt > issuedAt`).
- **Fallo de firma:** si el `TokenSigner` falla, el servicio no devuelve par alguno (no persiste nada).

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects unit \
  --runTestsByPath test/unit/issue-session-tokens.spec.ts   # 12/12
npm run test:unit   # 14 suites, 114 tests, 0 fallos
```

## Criterios de aceptación

- [x] Refresh persiste únicamente HMAC (el servicio no persiste; solo expone el hash) y mantiene el
  vencimiento absoluto original.
- [x] Access proyecta claims mínimos y el rol de la sesión.
- [x] Emisor usable tanto por login (`issueNewSession`) como por rotación (`issueForSession`) sin duplicar
  reglas (método `issueTokens` compartido).

## Pendiente / handoff

- **AUTH-065:** consumir `IssueSessionTokensService.issueNewSession` en el `LoginUseCase` productivo.
- **AUTH-067:** consumir `issueForSession` dentro del `SessionUnitOfWork` de rotación.
- **AUTH-072:** registrar `HmacRefreshTokenCodec` (`REFRESH_TOKEN_CODEC`) e `IssueSessionTokensService`
  (`ISSUE_SESSION_TOKENS`) en el módulo de login/sesiones.
- Sin bloqueos de infraestructura (suite unitaria).
