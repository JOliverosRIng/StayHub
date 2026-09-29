# Validation report — auth-service (Grupo 3)

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service` (trabajo sin commitear).

**Estado: PARCIAL LOCAL.** Todo el alcance propio de Auth está verificado localmente, pero **AUTH-076–081
permanecen BLOQUEADO EXTERNO** (proveedores G1/G2) y **la revisión humana de un integrante distinto sigue
pendiente**. Este informe no declara cerrado el entregable completo.

## Entorno

| Elemento | Valor |
|---|---|
| Node | 22.22.2 (los `engines` piden `>=20 <21`; solo warnings) |
| PostgreSQL | 16 (`postgres:16-alpine`) en `127.0.0.1:55432` |
| Redis | 7 (`redis:7-alpine`) en `127.0.0.1:56379/15` |
| Contenedores | Docker no instalado; **Podman 5.8.7** + podman-compose 1.6.0 (CI usa Docker) |
| Auth | puerto interno 3001, sin publicar al host |

No se copian credenciales, tokens ni PII: las claves y secretos son efímeros de prueba.

## Alcance verificado

**Bloque 2 (Registro, AUTH-026…048): COMPLETO.** 133 tests (unit 38, contract 42, security 5,
integration 48); cobertura US1 86.97/72.41/90.62/89.4. Detalle en `agents/AUTH-048/resultado.md`.

**Bloque 3 (Login/tokens/sesiones, AUTH-049…074): COMPLETO.** Cierre US2 en
`agents/AUTH-074/resultado.md`.

**Bloque 4 (Contratos/integración/cierre):**

| Plan | Estado | Evidencia |
|---|---|---|
| AUTH-075 | Verificado local (GREEN) | [resultado](../agents/AUTH-075/resultado.md) |
| AUTH-082 | Verificado local (GREEN, Podman) | [resultado](../agents/AUTH-082/resultado.md) |
| AUTH-083 | Verificado local (GREEN) | [resultado](../agents/AUTH-083/resultado.md) |
| AUTH-076 | BLOQUEADO EXTERNO (G2) | pendiente de provider/contrato |
| AUTH-077 | BLOQUEADO EXTERNO (G2) | pendiente de provider/contrato |
| AUTH-078 | BLOQUEADO EXTERNO (G1) | pendiente de expectativas |
| AUTH-079 | BLOQUEADO EXTERNO (G2) | depende de AUTH-076 |
| AUTH-080 | BLOQUEADO EXTERNO (G2) | depende de AUTH-077 |
| AUTH-081 | BLOQUEADO EXTERNO (G1) | depende de AUTH-078–080 |
| AUTH-084 | Parcial | este informe |

## Calidad final (revisión candidata)

```sh
npm run prisma:generate   # OK
npm run typecheck         # OK
npm run lint              # OK
npm run build             # OK
npm run openapi:check     # sintaxis + 11 tests de drift
npm run test:unit         # 17 suites, 140 tests
npm run test:contract     # 7 suites, 142 tests
npm run test:security     # 3 suites, 59 tests
npm run test:integration  # 11 suites, 98 tests
npm run test:coverage --workspace @stayhub/auth-service   # 38 suites, 439 tests, 0 fallos
npm run test:cross-service --workspace @stayhub/auth-service -- --runTestsByPath test/integration/auth-compose.spec.ts
                          # 1 suite, 7 tests (Podman)
```

| Cobertura | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| Global (38 suites) | 88.64% | 73.63% | 88.66% | 89.91% |

Umbral global del repo (70) superado en todas las métricas.

## Trazabilidad

| Requisito | Contrato | Prueba concreta | Resultado |
|---|---|---|---|
| RQ-02 (crear usuario y rol) | `POST /internal/v1/registrations` | `test/contract/registration.contract.spec.ts`, `test/integration/registration-saga.spec.ts` | OK local (stub Users) |
| FR-001 registro público | `RegisterCommand` | `registration.contract.spec.ts`, `register-account.use-case.spec.ts` | OK |
| FR-002 roles GUEST/OWNER | enum del contrato | `registration.contract.spec.ts`, `test/contract/openapi-drift.spec.ts` | OK |
| FR-003 validación de entrada | 400 del contrato | matriz 400 en `registration.contract.spec.ts` / `login.contract.spec.ts` | OK |
| FR-004 normalización email/nombre | descripciones del contrato | `registration.contract.spec.ts`, `users-*-adapter.spec.ts` | OK |
| FR-005 operación única | saga durable | `registration-saga.spec.ts`, `register-account.use-case.spec.ts` | OK |
| FR-006 idempotencia | `Idempotency-Key` | `registration-idempotency.spec.ts`, `registration-concurrency.spec.ts` | OK |
| FR-007 login | `POST /internal/v1/login` | `login.contract.spec.ts`, `login.use-case.spec.ts`, `login-persistence.spec.ts` | OK local (stub Users) |
| FR-008 credenciales inválidas 401 | 401 genérico | `login.contract.spec.ts`, `test/security/authentication-authorization.spec.ts` | OK |
| FR-009 identidad/rol vigentes | lookup Users | `users-login-identity-adapter.spec.ts`, `session-validation.contract.spec.ts` | OK |
| FR-010 access 1 h / refresh 7 d | `InternalTokenPair` | `issue-session-tokens.spec.ts`, `access-token.spec.ts`, `refresh-rotation.spec.ts` | OK |
| FR-011 validar antes de operar | validate + guards | `authentication-authorization.spec.ts`, `auth-modules.spec.ts` | OK |
| FR-012 sesión inválida 401 | `POST /internal/v1/sessions/validate` | `session-validation.contract.spec.ts`, `validate-session.use-case.spec.ts` | OK |
| FR-013 restricción por rol | guards de roles | `authentication-authorization.spec.ts` (403 vs 200) | OK |
| FR-024 secretos ocultos | D02/D10 | `test/security/registration-secrets.spec.ts`, `test/security/no-secret-leakage.spec.ts` | OK |
| SC-002 escenarios válidos | registro+login | `auth-modules.spec.ts`, `login-persistence.spec.ts` | OK local |
| SC-003 credenciales/sesiones/refresh inválidos | 401/429 | `login.contract.spec.ts`, `session-validation.contract.spec.ts`, `refresh.contract.spec.ts` | OK |
| SC-004 modificar perfil ajeno / rol | — | fuera del alcance de Auth (perfil pertenece a G2/G1) | No aplica a Auth |
| SC-007 criterios de RQ-01/RQ-02/Sprint 1 | — | agregado; RQ-01 (perfil) no es de Auth | Parcial |
| OpenAPI sin drift | `openapi-auth-service.yaml` | `openapi-drift.spec.ts` (11 tests) | OK |
| Imagen/Compose/migraciones | `Dockerfile`, `docker-compose.yml` | `auth-compose.spec.ts` (7 tests) | OK (Podman) |
| Concurrencia registro/sesión | — | `registration-concurrency.spec.ts`, `session-unit-of-work.spec.ts` | OK |
| Seguridad de secretos y trazas | — | `no-secret-leakage.spec.ts` (spans correlacionados) | OK |
| Revisión humana (constitución) | — | integrante distinto | **PENDIENTE** |

SC-001, SC-005 y SC-006 son criterios de usabilidad y no se certifican desde backend. RQ-01 y
FR-014–FR-023 corresponden a edición de perfil (otro servicio) y quedan fuera del alcance de Auth.

## Distinción stub vs real

- **Local con stub de Users:** AUTH-048, AUTH-074, AUTH-075, AUTH-082, AUTH-083. El stub implementa el
  contrato candidato `agents/contrato-users-candidato.md`; su verde **no acredita** al proveedor real.
- **Sin proveedor:** AUTH-076–081 no se ejecutaron. No se sustituyen por un stub para declarar
  integración.

## Dependencias externas pendientes

| Contrato | Owner | Condición para reanudar | Tareas |
|---|---|---|---|
| Users registro (`GET /internal/v1/registrations/{id}`, `UserSummary`) | G2 | aceptar/publicar contrato y provider | AUTH-076, AUTH-079 |
| Users lookup (`/internal/v1/login-identities/resolve`) | G2 | provider real y fixture de cambio de correo | AUTH-077, AUTH-080 |
| Gateway expectativas + URL/puerto público | G1 | congelar `openapi-public.yaml` y URL acordada | AUTH-078, AUTH-081 |

## Conclusión

El alcance propio de Auth queda implementado y verificado localmente con 439 tests verdes y cobertura
global ≥73.63%. El cierre completo (AUTH-084) **no se declara**: AUTH-076–081 siguen bloqueadas por G1/G2 y
falta la revisión humana exigida por la constitución. Este informe es preciso y parcial.
