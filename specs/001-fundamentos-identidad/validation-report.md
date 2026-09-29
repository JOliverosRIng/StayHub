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

---

# Validation report — api-gateway (Grupo 1), Fase 1

Fecha: 2026-09-29. Base: commit `9a0f79f`, rama `apigateway` creada desde `origin/Auth_Service`
(**trabajo sin commitear**). Alcance: GW-001–GW-009.

**Estado: FASE 1 COMPLETA (andamiaje) + GW-009.** El workspace del Gateway compila, pasa lint, tipos, 126 tests
y cobertura 100%. **No certifica comportamiento de ejecución**: el Gateway todavía no escucha, por lo
que el camino HTTPS/readiness del compose queda sin verificar en runtime (ver "Límites de esta fase").

## Entorno

| Elemento | Valor |
|---|---|
| Node | 22.15.0 (los `engines` piden `>=20 <21`; solo warnings `EBADENGINE`) |
| npm | 11.3.0 |
| Docker | 29.7.2 (daemon arrancado durante esta revisión; estaba detenido) |
| Base | `origin/Auth_Service` @ `9a0f79f` |

No se copian credenciales, tokens, PII ni certificados: nada sensible se versiona.

## Verificación ejecutada

```sh
npm run lint:gateway              # OK, 0 problemas
npm run typecheck:gateway         # OK
npm run test:gateway:coverage     # 6 suites, 35 tests, 0 fallos
npm run openapi:check:gateway     # OK
npm run build:gateway             # OK
docker build --target runtime -f infra/docker/gateway/Dockerfile .   # OK
docker compose config             # OK
```

| Cobertura del Gateway | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| Global | 100% | 100% | 100% | 100% |
| `infrastructure/config/*` (GW-009) | 100% | 100% | 100% | 100% |

Umbral del repo (70) superado. 9 suites y 126 tests en verde. La cobertura ya no es solo del
andamiaje: `gateway-config.ts` está cubierto al 100% en las cuatro métricas, incluidas las ramas
de rechazo.

## GW-009 — Configuración tipada con fail-fast

`infrastructure/config/gateway-config.ts` y `config.module.ts`, siguiendo el patrón ya escrito en
`auth-service` (interfaces `readonly`, helpers privados que lanzan `Error`, token `Symbol`, módulo
`@Global`). Diferencias deliberadas respecto a Auth: el `FileReader` es un **parámetro inyectado**
(Auth no tiene precedente de secretos por fichero) y hay helpers nuevos para CIDR, namespace de
Redis y versión TLS mínima.

Comportamiento verificado:

- 33 variables obligatorias: si falta cualquiera, `loadGatewayConfig` lanza y el módulo **rechaza
  compilar** (`Test.createTestingModule` con `GatewayConfigModule`).
- Secretos leídos de disco por `*_FILE`: clave de service JWT, contraseña de Redis, y verificación
  de existencia y contenido de los ficheros TLS. Fichero ilegible, vacío, sin marcadores PEM o con
  contraseña de menos de 8 caracteres → rechazo.
- Valores cerrados del contrato, no negociables: puerto **exactamente 8080** y prefijo
  **exactamente `/api/v1`** (D1), límites de registro `10/600 s`, de login `30/300 s` y
  `maxPhotoBytes` **exactamente 5000000** (se rechaza `5242880`, que es 5 MiB).
- Allowlist de proxies validada como CIDR real (rechaza `10.0.0.0` sin prefijo, octetos > 255 y
  `/64`); namespace de Redis restringido a caracteres seguros para no corromper claves de borde.
- `GATEWAY_TLS_MIN_VERSION` es la única variable con default documentado (`TLSv1.2`).

`.env.example` queda cubierto por `test/contract/gateway-env-example.spec.ts`, que carga el ejemplo
con el validador real y exige que documente cada variable obligatoria. Evita que la documentación
caduque respecto al código.

**Pendiente de wiring**: `GatewayConfigModule` todavía no está registrado en `AppModule`; ese
registro es tarea de **GW-022** ("Integrar módulos... en `AppModule`"). Hasta entonces el
fail-fast se activa cuando el módulo se instancia, no en el arranque del binario.

## Compose

`docker compose config` resuelve correctamente: 6 servicios (`api-gateway`, `auth-db`, `auth-migrate`,
`auth-redis`, `auth-service`, `gateway-redis`), redes `stayhub-internal` y `stayhub-edge` (ambas
`internal: true`), **un único puerto publicado (`8080`)** y 2 servicios con `restart: always`
(`api-gateway` y `auth-service`). `gateway-redis` es una instancia separada con secreto y namespace
propios (`GATEWAY_REDIS_NAMESPACE=gateway:edge`).

Los cuatro secretos del Gateway usan rutas por defecto bajo `.artifacts/gateway/` (ya ignorado por
git) mediante `${GATEWAY_*_SOURCE:-...}`, no `:?required`. Motivo: el bloque `secrets:` de Compose es
global, así que una variable obligatoria propia del Gateway habría roto el flujo documentado de G3
(`npm run env:auth:dev` → `docker compose up`), cuyo generador solo emite variables de Auth. Verificado:
`docker compose config` resuelve correctamente supplying únicamente variables de Auth.

**Aislamiento respecto a otros grupos:** el único cambio que afecta a servicios ajenos es el renombrado
de red `auth-internal` → `stayhub-internal` y `services` → `stayhub-edge`, exigido por **D6**. El
healthcheck de `auth-redis` y su `command` quedan idénticos a HEAD, y no se declaró ningún secreto de
Auth. `scripts/generate-auth-dev-env.mjs` no se tocó.

## Límites de esta fase (no verificado)

1. **El contenedor no sirve tráfico.** `main.ts` solo hace `app.init()`; no hay `listen()`. El
   contenedor arranca e inicializa Nest, pero **termina con código 0** de inmediato. Con
   `restart: always` esto produce un ciclo de reinicio sin servicio. El listener HTTPS es GW-010 y
   `/health/live` es GW-020, ambos en Fase 2. Por tanto el "readiness" de GW-007 se verificó **solo a
   nivel de configuración**; la prueba de runtime real es GW-063.
2. No se ejecutó `docker compose up`: requiere certificados TLS, ficheros de secretos y `.env`, y el
   servicio aún no escucha.
3. Suites `e2e`, `performance` y `security` están declaradas en `jest.config.ts` pero sin tests
   todavía (0 suites). El harness de GW-004 existe; los tests llegan con las historias.
4. Verificación local con Node 22.15.0, fuera del rango de `engines`. La CI sí usa Node 20.

## Hallazgos que exceden el Gateway

- **`auth-service` tiene 572 errores de lint preexistentes.** Comprobado con `git stash` sobre
  `eslint.config.mjs`: el HEAD `9a0f79f` produce el mismo resultado. Por tanto la línea
  `npm run lint  # OK` del informe de G3 (sección anterior) **no es reproducible**; conviene que G3
  lo revise. No se corrigieron aquí por ser código de otro grupo.
- **`npm run test:gateway -- --coverage` no aplicaba cobertura.** El doble encadenado npm consumía el
  flag, así que el umbral 70% nunca se habría evaluado en CI (fallo silencioso). Se añadieron
  `test:gateway:coverage` y `test:auth:coverage` y la CI los usa.
- El `.dockerignore` efectivo es el de la **raíz del contexto**, no el de `infra/docker/*/`. Se creó
  el de Gateway porque lo pide GW-006, pero es decorativo.
- **D4 requiere sign-off de G3**: se modificaron `openapi-auth-service.yaml` y
  `openapi-users-service.yaml`, que pertenecen a otros grupos.

## Trazabilidad D1/D4

| Decisión | Verificación |
|---|---|
| D1 `https://localhost:8080/api/v1` | `test/contract/openapi-public-server.spec.ts` + `scripts/check-public-openapi-syntax.mjs` |
| D4 Problem canónico (7 campos) | `test/contract/problem-details-unification.spec.ts` sobre los 3 contratos |
| Capas sin `domain/` | `test/unit/gateway-layer-structure.spec.ts` |
| Aislamiento entre servicios | `test/unit/no-cross-service-imports.spec.ts` |
| Registro del workspace | `test/unit/workspace-registration.spec.ts` |

## Conclusión

GW-001–GW-008 están implementados y verificados a nivel de compilación, calidad estática, pruebas,
cobertura, imagen y configuración de Compose. **Este informe no declara el Gateway operativo**: el
arranque HTTPS, la configuración con fail-fast (GW-009) y la readiness (GW-020) pertenecen a la
Fase 2, y GW-063 debe verificar el runtime. Revisión humana pendiente.
