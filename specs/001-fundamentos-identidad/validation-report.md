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

# Validation report — api-gateway (Grupo 1), Fase 1 + Bloques 0a/0b/0c

Fecha: 2026-09-29. Base: commit `83ad6bc` ("apigateway v1"), rama `apigateway`, que es descendiente
directo de `origin/Auth_Service` @ `9a0f79f`. Alcance: GW-001–GW-021 (Fase 1 y Bloques 2, 0b y 0c completos).

**Estado: FASE 1 COMPLETA (andamiaje) + GW-009–GW-021.** El workspace del Gateway
compila, pasa lint, tipos, 334 tests y cobertura 93.18%. GW-010 cierra el hueco crítico de la Fase 1: **el
proceso levanta un servidor HTTPS real en 8080 con prefijo `/api/v1` y no acepta clientes HTTP planos**,
verificado tanto en suite como arrancando la imagen. GW-013 y GW-014 añaden el origen confiable y el
Redis de borde con operación atómica y fallo cerrado. GW-015 y GW-016 cierran la autenticación del borde:
emisión del service JWT del Gateway y verificación del bearer de usuario con Passport. GW-011 y GW-012
consolidan la capa de contrato y observabilidad: *whitelist* estricta, Problem Details canónico con
`traceId`, trazas y logs JSON con redacción. GW-017 elimina las cabeceras de identidad, *forwarding* y
service-auth aportadas por el cliente, y GW-021 genera el documento OpenAPI público. Queda sin verificar
el *readiness* (no existe todavía `/health/live`, es GW-020).

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
npm run test:gateway:coverage     # 26 suites, 334 tests, 0 fallos
npm run openapi:check:gateway     # OK
npm run build:gateway             # OK
docker build --target runtime -f infra/docker/gateway/Dockerfile .   # OK
docker compose config             # OK
docker compose up -d api-gateway  # Up, TLS sirviendo en 8080, Redis de borde alcanzable
```

| Cobertura del Gateway | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| Global | 93.18% | 80.68% | 98.27% | 94.07% |
| `infrastructure/config/*` (GW-009) | 100% | 100% | 100% | 100% |
| `infrastructure/cache/*` (GW-014) | 94.33% | 90% | 100% | 93.61% |
| `infrastructure/security/*` (GW-013, GW-016) | 90.76% | 74.56% | 100% | 90.32% |
| `infrastructure/service-auth/*` (GW-015) | 100% | 100% | 100% | 100% |
| `infrastructure/observability/*` (GW-012) | 100% | 100% | 100% | 100% |
| `modules/auth/*` (GW-016) | 96.29% | 100% | 100% | 95.65% |
| `interfaces/openapi/*` (GW-021) | 100% | 100% | 100% | 100% |
| `main.ts` (GW-010) | 85% | 0% | 75% | 85% |

Umbral del repo (70) superado en las cuatro métricas. 26 suites y 334 tests en verde tras el Bloque 0c. La
cobertura global baja décimas respecto a 0b (93.9% → 93.18%) porque el bloque incorpora interceptores y
una factoría con rutas que se ejecutan en runtime, no en la suite de Gateway todavía: `mountPublicSwagger`,
`IdentityHeaderInterceptor.intercept` a través de la cadena completa y `problemResponse` para estados sin
respuesta declarada. El descenso es esperado y no afecta al umbral. `gateway-config.ts` sigue cubierto al
100% en las cuatro métricas, incluidas las ramas de rechazo. La rama no cubierta de `main.ts` es
exclusivamente la guarda `require.main === module`, que dentro de Jest siempre es falsa por construcción;
su cara verdadera se verifica arrancando la imagen (§GW-010).

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

## GW-010 — Listener HTTPS en 8080 con prefijo `/api/v1`

`main.ts` deja de hacer `app.init()` y arranca de verdad: `httpsOptions` derivado de la configuración
validada, `setGlobalPrefix(config.apiPrefix)` y `listen(config.port)`. El guardián
`require.main === module` hace el módulo importable desde las pruebas sin disparar el arranque.

Verificado en tres niveles:

| Nivel | Evidencia |
|---|---|
| Unitario | `httpsOptionsFrom` lee el certificado y la clave como `Buffer`, reenvía `minVersion` y falla ruidosamente si el fichero no es legible (`test/unit/https-options.spec.ts`) |
| E2E | TLS 200 en `/api/v1/probe`, 404 en `/probe`, y el cliente HTTP plano **no** obtiene respuesta (`test/e2e/https-listener.spec.ts`) |
| Runtime | Imagen arrancada: `Up`, `curl --cacert` → `http_code=404`, `ssl_verify=0`; `curl http://` → `exit 52` (empty reply) |

El `404` en runtime es lo correcto en este punto: `AppModule` todavía no registra rutas, que llegan con
las historias de usuario. Lo que GW-010 certifica es que el **proceso escucha TLS y aplica el prefijo**,
no que haya endpoints.

**Material TLS de prueba.** `AGENT.md` prohíbe versionar certificados y no hay `openssl` disponible, así
que `test/support/tls-fixture.ts` emite en tiempo de ejecución un certificado X.509 autofirmado
(ECDSA P-256, SAN `DNS:localhost`) codificando DER a mano, sin dependencias y sin claves en el
repositorio. El cliente de las pruebas lo usa como CA, de modo que el handshake se verifica de verdad y
no se relaja con `rejectUnauthorized: false`.

**Detalle de entorno.** En Windows, `SO_REUSEADDR` permite que dos sockets accepten el mismo puerto, así
que dos servidores consecutivos en 8080 enrutan conexiones de forma indeterminada y producen
`ECONNRESET` intermitentes. Por eso la suite levanta **un único** servidor y `startGateway` comparte con
`createGatewayApp` el seam de módulo raíz; así el punto de entrada real del proceso es lo que se prueba.

## GW-013 — Origen confiable y protección contra *spoofing* de `X-Forwarded-For`

`infrastructure/security/ip.ts` (primitivas sin dependencias) y `trusted-origin.service.ts` (decisión de
origen). Sin dependencias externas: no se usa `ipaddr.js` ni `netmask`, para no ampliar la superficie.

Regla implementada, en este orden:

1. El origen por defecto es `socket.remoteAddress` (no una cabecera).
2. `X-Forwarded-For` **solo** se acepta si el peer inmediato pertenece a `GATEWAY_TRUSTED_PROXY_CIDRS`.
   Un cliente que se connectsé directamente no puede inyectar su IP de origen.
3. La cadena se recorre **de derecha a izquierda** saltando los proxies confiables y se devuelve el
   primer segmento **no** confiable. Es el orden correcto: los segmentos de la derecha los añadió el
   último proxy y son los que no controla el cliente.
4. Si toda la cadena es de proxies confiables, se devuelve el segmento más a la izquierda.
5. Normalización: `::ffff:a.b.c.d` → `a.b.c.d` (así lo reporta Node), y IPv6 en forma canónica
   comprimida (RFC 5952) para que la misma dirección produzca siempre la misma clave de Redis.
6. Ante cualquier dirección inválida (propia o de la cadena) se **falla cerrado** al peer inmediato.

`ip.ts` implementa CIDR sin `net` para poder distinguir familia y prefijo: rechaza `10.0.0.0` sin
prefijo, `/33` en IPv4, `/64` sobre una dirección IPv4, y **no mezcla familias** (`2001:db8::5` no
coincide con `203.0.113.0/24`).

Dos defectos reales encontrados y corregidos durante la implementación, ambos por pruebas:

- La longitud total en bits de IPv6 estaba calculada como `grupos * 4` (32) en vez de `grupos * 16`
  (128), de modo que un prefijo `/32` caía en la rama de coincidencia exacta y **ningún prefijo IPv6
  corto funcionaba**. Ahora se deriva de la longitud real en bytes.
- `parseIp` devolvía la forma expandida (`2001:db8:0:0:0:0:0:1`). Se cambió a la forma comprimida
  canónica, que es la que acaba en claves de Redis y en logs.

Verificado en `test/unit/trusted-origin.spec.ts` (13 casos): origen por socket, rechazo del
`X-Forwarded-For` desde peer no confiable, aceptación desde proxy permitido, cadenas multi-salto,
cadena íntegramente confiable, direcciones inválidas y peer ausente.

## GW-014 — Redis de borde atómico con fallo cerrado

`infrastructure/cache/{gateway-redis.module,gateway-redis.service,rate-limit.store}.ts`, siguiendo el
patrón que G3 ya escribió en `auth-cache.adapter.ts`: script Lua, `lazyConnect`, `maxRetriesPerRequest: 1`
y cliente inyectable para pruebas.

- **Atomicidad**: un único `EVAL` hace `INCR` + `PEXPIRE` + `PTTL`, de modo que no existe ventana entre
  "contar" y "caducar". La ventana se fija en el **primer** intento y no se renueva en los siguientes
  (ventana fija, no deslizante).
- **Namespaces propios**: claves `{GATEWAY_REDIS_NAMESPACE}:{ámbito}:{origen}`, con los valores del
  contrato: registro `10/600 s` y login `30/300 s`, leídos de la configuración en lugar de estar escritos
  a mano en el código.
- **Se cuenta todo intento**, incluidos los ya denegados: el `INCR` ocurre antes de decidir.
- **429 con `Retry-After` exacto** cuando `count > límite`; el valor se deriva del `PTTL` real, nunca de
  un constante, y nunca es 0 al denegar.
- **Fallo cerrado**: cualquier error de Redis, o una respuesta del script que no sea
  `[número, número]`, lanza `GatewayDependencyError` → **503**, nunca "paso el tráfico".

Prueba determinante contra **Redis 7 real** (`test/integration/rate-limit.store.redis.spec.ts`), no
contra un doble:

| Escenario | Resultado esperado y obtenido |
|---|---|
| 50 peticiones **concurrentes** a registro | exactamente **10** permitidas, 40 denegadas con `Retry-After` |
| 60 peticiones concurrentes a login | exactamente **30** permitidas |
| 15 intentos secuenciales | contador en Redis = `15` (cuenta todos los intentos) |
| TTL tras el 1.º y el 2.º intento | el 2.º **no** renueva la ventana |
| Ventana de 1 s agotada | vuelve a admitir tráfico tras expirar |
| Ámbitos y orígenes distintos | contadores separados, 4 claves distintas |
| Redis inalcanzable | `GatewayDependencyError`, sin conceder tráfico |

**Cambio de CI.** Se añadió `ioredis@5.4.2` a `apps/api-gateway/package.json` (antes se resolvía por
transitivo desde `auth-service`, lo que no es reproducible) y un servicio `redis:7-alpine` con
`GATEWAY_TEST_REDIS_URL` al job `gateway-quality`, para que estas pruebas **se ejecuten** en CI en vez de
saltarse. `package-lock.json` quedó sincronizado; `npm ls ioredis --workspace @stayhub/api-gateway`
resuelve `ioredis@5.4.2`.

**Defecto real corregido**: con `enableOfflineQueue: false` (necesario para fallar cerrado) el apagado
ordenado lanzaba `Stream isn't writeable` en `quit()` cuando Redis estaba caído, rompiendo
`onModuleDestroy` justo en el escenario de fallo. Ahora cae a `disconnect()`.

**Pendiente de wiring**: `AppModule` sigue vacío, así que `GatewayRedisModule` **no se instancia en el
proceso** todavía; su registro es **GW-022**. En runtime solo se verificó que el Gateway levanta con TLS y
que su Redis de borde es alcanzable por la red `stayhub-edge` con secreto, no que el cliente del Gateway
se haya conectado.

## GW-015 — Service JWT del Gateway, separado del bearer de usuario

`infrastructure/service-auth/service-token.provider.ts` (`ServiceTokenProvider.issue()`), espejando el
`users-service-token.provider.ts` de Auth: firma con `jose` (`importPKCS8` + `SignJWT`), nunca
`jsonwebtoken`.

- **Credencial de servicio, no de usuario**: `sub = 'api-gateway'`, `iss`/`aud`/`scope` tomados de
  `config.serviceJwt` (no escritos a mano) y **sin** claims `sid` ni `role`; el token de usuario que sí los
  lleva es un espacio de credencial distinto.
- **RS256 con `kid` propio** (`gateway-2026-01` de config) y `typ: 'JWT'`, `jti` aleatorio por emisión
  (`randomUUID()`), `exp - iat` exactamente igual al TTL configurado (60 s).
- **Falla ruidosamente**: con una clave privada inutilizable, `issue()` rechaza en vez de devolver un token
  inválido.

Prueba determinante (`test/unit/service-token.provider.spec.ts`, 9 casos): la firma valida contra la clave
pública del Gateway con `jwtVerify`; el mismo token **no** valida contra issuer/audience de usuario; el
header y las claims faltantes se comprueban explícitamente; issuer/audience/scope/`kid` cambian al
cambiar la configuración.

## GW-016 — Verificación del bearer de usuario con Passport (RS256)

`application/ports/jwt-verifier.port.ts`, `infrastructure/security/jwt-verifier.service.ts` y
`modules/auth/{jwt.strategy.ts,gateway-auth.module.ts}`. La estrategia usa `passport-custom` +
`@nestjs/passport` (`PassportStrategy(CustomStrategy, ...)`), igual que Auth, **no** `passport-jwt`.

- **Allowlist de algoritmos y `kid`**: se rechaza si `alg !== 'RS256'` o si `kid` no está en
  `config.userJwt.publicKeys`; la verificación usa la clave pública de ese `kid`, no una genérica.
- **Issuer/audience** exigidos desde config y **claims obligatorios** `sub, sid, role, jti, iat, exp`
  (`requiredClaims`); `sub`/`sid`/`jti` deben cumplir patrón UUID y `role` debe pertenecer a la allowlist
  **`GUEST | OWNER | ADMIN`** del contrato (mayúsculas). `exp` debe ser posterior a `iat` e `iat` no puede
  estar en el futuro (> `now+60 s`).
- **Aislamiento de credenciales**: un service JWT del Gateway (GW-015) presentado como bearer de usuario
  se rechaza, porque no satisface rol/UUID ni issuer/audience.
- **Fallo opaco**: la estrategia colapsa cualquier motivo (token ausente, mal formado, firma inválida,
  expirado, claims inválidos) en `UnauthorizedException('Access token is invalid')`, sin filtrar la causa.
- **Claves reales en pruebas**: el fixture `gateway-config-fixture.ts` genera un par RSA-2048 en runtime
  (`generateKeyPairSync`) y deriva `GATEWAY_JWT_PUBLIC_KEYS_JSON` de la clave pública real, de modo que la
  verificación se ejercita con material criptográfico auténtico y sin versionar claves.

Pruebas (`test/unit/jwt-verifier.spec.ts` y `test/unit/gateway-auth.module.spec.ts`, por DI real con
`Test.createTestingModule`): token válido, `kid` fuera de allowlist, `alg` distinto de RS256, cabecera sin
`kid`, issuer y audience erróneos, expirado, firma inválida, clave impostora, claims faltantes o con
formato inválido, los tres roles del contrato aceptados y service JWT rechazado.

**Defecto real detectado por el build de imagen**: `jose`, `@nestjs/passport`, `passport` y
`passport-custom` se usaban en el Gateway sin estar declarados en `apps/api-gateway/package.json`; se
resolvían por *hoisting* desde `auth-service`, así que el build local, los tests y el typecheck pasaban,
pero la imagen **fallaba** con `TS2307: Cannot find module 'jose'` (el `npm ci` del Dockerfile solo copia
los manifiestos de la raíz y del Gateway, por lo que no instalaba esos paquetes). Es exactamente el
mismo problema que motivó declarar `ioredis` en GW-014. Se corrigió declarando las cuatro dependencias
con las mismas versiones fijadas por Auth (`jose@5.9.6`, `@nestjs/passport@10.0.3`, `passport@0.7.0`,
`passport-custom@1.2.1`) y sincronizando `package-lock.json`; con eso `docker build --target runtime`
termina en exit 0. Lección: **el build local no es evidencia de dependencias declaradas**, hay que
verificar también la imagen.

**Pendiente de wiring**: igual que GW-014, `GatewayAuthModule` aún no está montado en `AppModule`
(queda para GW-022); el módulo se prueba por inyección de dependencias pero el proceso todavía no
registra la estrategia.

## GW-011 — *Whitelist* estricta y Problem Details canónico

`interfaces/http/validation.pipe.ts` (`GatewayValidationPipe`), `problem.mapper.ts` (`mapProblem`),
`problem.filter.ts` (`ProblemDetailsFilter`) y `trace-id.ts`. La tubería usa
`whitelist` + `forbidNonWhitelisted` + `forbidUnknownValues` sobre `plainToInstance`, por lo que **un campo
no declarado en el DTO es un 400, no un campo ignorado**. Se verificó explícitamente el caso de contraseña:
sin `transform` ni `enableImplicitConversion`, `Password123!` se conserva byte a byte, sin *trim* ni cambio
de mayúsculas/minúsculas. Los errores se mapean a `FieldError[]` (`field` + `code`) con rutas anidadas
unidas por punto, y el `code` de negocio es `VALIDATION_FAILED`.

`mapProblem` produce los siete campos canónicos de D4, con `type` derivado del código
(`https://stayhub.example/problems/<kebab-code>`) y `instance` igual a la ruta de la petición **sin query
string** para no filtrar identificadores. Los títulos se alinearon con los literales ya publicados por
`auth-service` (`NOT FOUND`, `VALIDATION_FAILED`…) para no romper clientes que comparen por texto. El
`detail` es genérico y **todo 5xx devuelve siempre el mismo texto**, de modo que un error inesperado no
puede filtrar el nombre de un servicio interno. El test contractual
`test/contract/problem-details-unification.spec.ts` sigue en verde.

`ProblemDetailsFilter` responde con `Content-Type: application/problem+json` y propaga el `traceId` del
error cuando existe. `trace-id.ts` acepta un `x-trace-id` entrante **solo** si cumple
`/^[A-Za-z0-9_-]{8,128}$/`; cualquier otro valor se descarta y se genera un UUID, lo que cierra la
inyección de saltos de línea o cabeceras en los logs.

**Discrepancia detectada entre servicios (no se corrige aquí).** D4 define `errors: FieldError[]`, y así lo
implementa el Gateway. Pero el `ProblemDetails` de `auth-service` tipa `errors` como `string[]`. La prueba
de unificación de D4 pasa porque solo comprueba los siete campos canónicos, no la forma de `errors`; el
contrato público tampoco define el esquema `FieldError`, pese a que lo referencia
(`errors: { type: array, items: { $ref: '#/components/schemas/FieldError' } }`), dejando un `$ref`
colgante. Ambas cosas son de G3 y deben resolverse allí; el Gateway ya es conforme a D4.

## GW-012 — Trazas y logs estructurados con redacción

`infrastructure/observability/otel.ts`, `gateway-logger.ts` y `interfaces/http/trace.interceptor.ts`.
El arranque de OpenTelemetry es idempotente y añade los sufijos correctos del endpoint
(`/v1/traces`, `/v1/logs`); el *shutdown* es seguro aunque se invoque dos veces, y no queda ningún
exportador ni *span* vivo al terminar la suite.

`GatewayLogger` emite una línea JSON por evento, escribiendo `warn` y `error` en `stderr` y el resto en
`stdout`. La redacción actúa sobre **el valor**, no sobre la clave, y cubre `password`, `email`, `token`,
`accessToken`, `refreshToken`, `secret`, `authorization`, `cookie` y `photo`: los JWT quedan como
`[redacted]`, los correos con su parte local enmascarada, y las fotos se sustituyen por su cardinalidad
en lugar de su contenido. Un contexto con una clave no permitida se descarta entero en vez de filtrarse,
y los contextos se fusionan con `Object.assign` de forma explícita y sobre una copia.

`TraceInterceptor` propaga o genera el `traceId`, lo escribe en la respuesta, anota el *span* con método y
**ruta de plantilla** (no la ruta con identificadores, para no cardinalizar el trazo), marca `ERROR` en 5xx
y añade un evento cuando una dependencia cae. Cobertura del 100% en las cuatro métricas.

## GW-017 — Eliminación de cabeceras de identidad, *forwarding* y service-auth

`interfaces/http/security/identity-header.interceptor.ts`. Antes de enrutarse, la petición pierde 20
cabeceras: suplantación de identidad (`x-user-id`, `x-user-role`, `x-user-email`, `x-session-id`,
`x-authenticated-user`, `x-forwarded-user`), *forwarding* del borde (`x-forwarded-for`, `-host`, `-proto`,
`-port`, `-prefix`, `x-real-ip`, `x-client-ip` y el `forwarded` de RFC 7239) y credenciales de servicio
(`x-service-token`, `x-service-auth`, `x-service-jwt`, `x-service-authorization`, `x-api-key`,
`x-internal-token`). La comparación no distingue mayúsculas, porque un objeto de cabeceras construido a
mano en un test o por un middleware podría no venir normalizado por Node.

La lista de cabeceras **conservadas** se fija también por test, y es deliberada: `authorization` y
`cookie` las necesita el propio Gateway para validar el bearer de usuario (GW-016) y la cookie de refresh,
`idempotency-key` la aporta legítimamente el cliente, y `x-trace-id` es la propagación de contexto
 habits. Lo que se elimina es toda *afirmación de identidad* que el cliente pueda fabricar, nunca la
credencial que el Gateway debe comprobar por sí mismo. 34 tests.

## GW-021 — OpenAPI público

`interfaces/openapi/openapi.factory.ts` y `openapi.module.ts`. El documento se genera a partir de
`GatewayConfig` y declara el servidor único de D1 (`https://localhost:8080/api/v1`), sustituible por
`GATEWAY_SWAGGER_SERVER_URL`, que **se rechaza si no es `https`**. Los esquemas de seguridad coinciden
campo a campo con el contrato público: `bearerAuth` (`http`/`bearer`/`JWT`) y `refreshCookie`
(`apiKey` en cookie `stayhub_refresh`), con ambas alternativas en `security`.

El documento aporta lo reutilizable por los controladores de cada historia: `problemResponse(status)` para
las nueve respuestas `application/problem+json` del contrato (400, 401, 403, 404, 409, 413, 415, 429, 503),
la cabecera `Retry-After` en 429, el parámetro reutilizable `Idempotency-Key` y `multipartRequestBody()`
con el campo `photo` declarado como `string`/`binary`. El esquema `Problem` exige exactamente los siete
campos canónicos y modela `errors` como array de `$ref` a `FieldError`, que **la factoría sí define**,
resolviendo el `$ref` colgante del contrato público. El test de GW-021 compara el documento generado contra
`openapi-public.yaml` leído del disco, de modo que cualquier deriva entre ambos se detecta sola.

`paths` es un objeto vacío a propósito: las rutas las añaden los controladores de las historias de usuario,
y el contrato `openapi-public.yaml` sigue siendo la fuente de verdad hasta entonces. Swagger UI se monta
en `/docs` **solo en `development`**, siguiendo el precedente de `auth-service`; fuera de ese entorno la
función devuelve el documento sin exponerlo, y el montaje en `main.ts` queda para GW-022.

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

1. **No hay readiness.** El contenedor sirve HTTPS en 8080 (GW-010, verificado), pero `/health/live` y
   `/health/ready` **no existen todavía**: son GW-020. Por tanto el healthcheck de `api-gateway` en
   Compose no puede quedar `healthy` (se observó `health: starting` con el proceso `Up`) y la integración
   completa de `docker compose up` sigue pendiente (GW-063). El "readiness" de GW-007 se verificó
   **solo a nivel de configuración**.
2. `docker compose up` sí se ejecutó para `api-gateway` (y sus dependencias `auth-service` y
   `gateway-redis`) con material TLS y secretos generados en runtime bajo `.artifacts/gateway/`, ya
   borrados. No se versionó ningún secreto. Se comprobó el fail-fast de GW-009 de forma **real**: con la
   clave TLS ausente o ilegible el contenedor entra en `restarting` con
   `GATEWAY_TLS_KEY_FILE points to a path that cannot be read`. Nota de despliegue: los ficheros
   montados como secretos deben ser legibles por el usuario del contenedor; con `0600 root` la clave
   TLS no se lee aunque el certificado `0644` sí.
3. La suite `e2e` ya tiene tests (GW-010); `performance` y `security` siguen declaradas y vacías. Sus
   pruebas llegan con las historias de usuario y con GW-061.
4. Verificación local con Node 22.15.0, fuera del rango de `engines`. La CI sí usa Node 20.
5. **El Bloque 0c entrega componentes, no un proceso cableado.** `GatewayValidationPipe`,
   `ProblemDetailsFilter`, `GatewayLogger`, `TraceInterceptor` e `IdentityHeaderInterceptor` existen y
   están probados de forma aislada, pero **ninguno está registrado en `AppModule` ni en `main.ts`**; el
   arranque de OpenTelemetry tampoco se invoca todavía. Es exactamente el trabajo de GW-022, y por eso las
   cifras de cobertura de 0c no incluyen el arranque de la aplicación. Lo mismo aplica a
   `GatewayAuthModule` y `GatewayRedisModule`, pendientes de GW-022. Hasta ese momento, el proceso real
   **no** filtra cabeceras, **no** devuelve Problem Details y **no** traza: solo sirve TLS y enruta.
6. La imagen se reconstruyó y arregló con las dependencias OTel y `@nestjs/swagger` ya declaradas
   (`@nestjs/swagger@8.1.1` se añadió en GW-021 por el mismo motivo que motivó GW-015: resolvía por
   *hoisting* desde `auth-service` y el `npm ci` del Dockerfile no la instalaba). `docker build --target
   runtime` verificado en verde **después** de añadir ambas, no antes.

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
| D1 `https://localhost:8080/api/v1` | `test/contract/openapi-public-server.spec.ts` + `scripts/check-public-openapi-syntax.mjs` + `test/unit/openapi.factory.spec.ts` |
| D4 Problem canónico (7 campos) | `test/contract/problem-details-unification.spec.ts` sobre los 3 contratos + `test/unit/problem.mapper.spec.ts` |
| Capas sin `domain/` | `test/unit/gateway-layer-structure.spec.ts` |
| Aislamiento entre servicios | `test/unit/no-cross-service-imports.spec.ts` |
| Registro del workspace | `test/unit/workspace-registration.spec.ts` |
| El Gateway no acepta identidad del cliente (FR-011) | `test/unit/identity-header.interceptor.spec.ts` |

## Conclusión

GW-001–GW-008 están implementados y verificados a nivel de compilación, calidad estática, pruebas,
cobertura, imagen y configuración de Compose; GW-009, GW-010, GW-013 y GW-014 añaden configuración con
fail-fast, listener HTTPS real, origen confiable y Redis de borde atómico con fallo cerrado; GW-015 y
GW-016 añaden la emisión del service JWT del Gateway y la verificación del bearer de usuario con
allowlist de `kid`/algoritmo/rol; GW-011 y GW-012 consolidan el contrato de error y la observabilidad
(*whitelist* estricta, Problem Details canónico con `traceId`, trazas y logs JSON con redacción); GW-017
impide que el cliente fabrique su propia identidad; GW-021 publica el documento OpenAPI coherente con el
contrato. **Este informe no declara el Gateway operativo**: el registro de módulos y componentes globales
en `AppModule` (GW-022) y el *readiness* (GW-020) siguen pendientes, y GW-063 debe verificar el runtime
completo. Revisión humana pendiente.
