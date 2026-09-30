# AUTH-072 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-046 y AUTH-071 (implementadas localmente). Reglas aplicadas: D01, D02, D04–D06,
D08–D10.

## Objetivo

Componer los módulos funcionales de Auth (Tokens, Sessions, Login) y el binding `USERS_SERVICE`, sacar los
providers de estado de `AppModule` y verificar un recorrido completo real register → login → validate →
refresh → replay → validate 401 sobre PostgreSQL/Redis y Users stub.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/modules/tokens/tokens.module.ts` | **Nuevo.** Provee `TOKEN_SIGNER` (`Rs256TokenService`), `REFRESH_TOKEN_CODEC` (`HmacRefreshTokenCodec`) e `ISSUE_SESSION_TOKENS` (factory). | Emisión compartida sin ciclos. |
| `src/modules/sessions/sessions.module.ts` | **Nuevo.** Provee repos de sesión/refresh, `SESSION_UNIT_OF_WORK`, factories `ROTATE_REFRESH_TOKEN_USE_CASE` y `VALIDATE_SESSION_USE_CASE`, y `AccessTokenStrategy`/guards; registra `SessionsController`; importa Prisma/Tokens/ServiceAuth/Passport. | Composición de sesiones, rotación e introspección. |
| `src/modules/login/login.module.ts` | **Nuevo.** Provee `LOGIN_RATE_LIMITER` (factory con `AUTH_CACHE` + secreto) y `LOGIN_USE_CASE` (factory `LoginService`); registra `LoginController`. | Composición de login. |
| `src/infrastructure/http/users-service.adapter.ts` | **Nuevo.** `UsersServiceAdapter implements USERS_SERVICE` delegando registro a AUTH-041 y lookup a AUTH-063. | Binding único del puerto Users. |
| `src/modules/service-auth/service-auth.module.ts` | Provee/exporta `UsersRegistrationClient`, `UsersLoginIdentityClient`, `UsersServiceAdapter` y `USERS_SERVICE`. | Evitar duplicar adapters en cada módulo. |
| `src/modules/registration/registration.module.ts` | Se retira `UsersRegistrationClient` de sus providers (usa el export de ServiceAuthModule). | Sin instancias duplicadas. |
| `src/app.module.ts` | Importa Tokens/Sessions/Login; elimina providers base privados (signer, repos de sesión/refresh) y deja solo `TraceInterceptor`. | `AppModule` como composición. |

No hay ciclos: `TokensModule` solo depende de Core; `SessionsModule` de Tokens; `LoginModule` de
Credentials/Tokens/Sessions/ServiceAuth; el issuer no depende de Login/Sessions y el UoW lo consume el caller.

## Comportamiento verificado (auth-modules.spec.ts, 4/4)

1. **DI real:** resuelven `USERS_SERVICE`, `LOGIN_RATE_LIMITER`, `LOGIN_USE_CASE`,
   `ROTATE_REFRESH_TOKEN_USE_CASE`, `VALIDATE_SESSION_USE_CASE`, `ISSUE_SESSION_TOKENS` y los controladores
   `LoginController`/`SessionsController`/`RegistrationController` sin `UnknownDependenciesException`.
2. **Recorrido completo:** `POST /internal/v1/registrations` → 201; `POST /internal/v1/login` → 200 con
   `principal`; `POST /internal/v1/sessions/validate` → `{active:true,role:'GUEST'}`; `POST .../refresh` → 200
   con token rotado; repetir el refresh viejo → 401 `REFRESH_TOKEN_INVALID` (replay) y la sesión pasa a
   `SESSION_INVALID` en la validación siguiente.
3. **Health:** `/health/live` y `/health/ready` 200 (DB + Redis reales).
4. **Bootstrap sin config:** compilar `AppModule` sin `AUTH_PORT` falla (config requerida).

El cierre de la app ejecuta `onModuleDestroy` (Prisma, Redis, scheduler y cliente Redis del cache) sin dejar
handles ni colgar Jest.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run openapi:check   # OK
npm run test:unit       # 16 suites, 137 tests
npm run test:security   # 2 suites, 46 tests
npm run test:contract   # 6 suites, 131 tests

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/auth-modules.spec.ts   # 4/4

# Proyecto de integración completo: 11 suites, 98 tests, 0 fallos
```

## Criterios de aceptación

- [x] Cuatro handlers (login, refresh, validate, registro) y health resuelven DI real.
- [x] No hay ciclos ni providers duplicados de estado (un único signer, codec, issuer, UoW y `USERS_SERVICE`).
- [x] El recorrido completo con replay pasa con dependencias reales de Auth.

## Pendiente / handoff

- **AUTH-073:** sincronizar el contrato OpenAPI de sesión con el Swagger generado.
- **AUTH-074:** cierre de la historia de autenticación (reejecución integral).
- Sin bloqueos de infraestructura.
