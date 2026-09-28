# Implementation Plan: Fundamentos e identidad

**Branch**: `001-fundamentos-identidad` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: `spec.md`, `tasks.md`, la constitución de StayHub, `tendencias.md`, los artefactos de
diseño existentes y el estado real del repositorio.

## 1. Alcance backend del Sprint 1

El Sprint 1 implementa el primer incremento de identidad de StayHub mediante tres aplicaciones
NestJS 10 con TypeScript estricto, desarrolladas por tres grupos de dos personas:

| Grupo | Aplicación | Responsabilidad principal |
|---|---|---|
| Grupo 1 | API Gateway | Punto de entrada HTTPS, routing, controles de borde e integración. |
| Grupo 2 | `users-service` | Identidad, correo, rol, perfil, foto y persistencia de usuario. |
| Grupo 3 | `auth-service` | Credenciales, registro coordinado, login, JWT, sesiones y refresh tokens. |

El alcance funcional conserva íntegramente RQ-01, RQ-02, FR-001–FR-024 y los escenarios de
aceptación del `spec.md`:

- Registro público con nombre, correo, contraseña y rol `GUEST` u `OWNER`; `ADMIN` se reconoce,
  pero su aprovisionamiento y cualquier cambio de rol permanecen fuera de esta feature.
- Login con mensajes que no permiten enumerar cuentas.
- Access JWT RS256 de una hora y sesión renovable hasta siete días desde el login.
- Refresh token opaco, rotatorio y de un solo uso; su reutilización revoca la sesión.
- Validación JWT, autenticación, autorización por rol y protección por ownership.
- Consulta y actualización atómica del perfil propio: nombre, correo, teléfono, foto y
  preferencias.
- Persistencia independiente de Users y Auth en PostgreSQL 16.
- Swagger/OpenAPI, manejo de errores, logging seguro, Docker Compose y pruebas backend.

No se incluyen alojamientos, búsquedas, reservas, pagos, recuperación o cambio de contraseña,
verificación de correo, MFA, eliminación de cuentas, administración de otras cuentas ni cambios
de rol.

### Estado real del repositorio

El repositorio continúa greenfield: contiene documentación y Spec Kit, pero no contiene aún
`package.json`, lockfile, aplicaciones NestJS, esquemas ORM, migraciones, Dockerfiles ni Compose.
Por ello no existen convenciones de código implementadas que contradigan las decisiones de los
artefactos vigentes. Se conserva el monorepo `apps/`, NestJS 10, Node.js 20 LTS, PostgreSQL 16,
Passport, JWT, Swagger, Docker Compose y Prisma ORM 6.x como única opción ORM; no se introduce
TypeORM.

### Trazabilidad del incremento

| Fuente | Resultado backend | Grupos responsables |
|---|---|---|
| RQ-02; FR-001–FR-006 | Cuenta única, completa e idempotente con rol público permitido. | G3 coordina registro; G2 crea/activa identidad; G1 expone y protege la entrada. |
| FR-007–FR-013 | Login, JWT, refresh, validación y autorización. | G3 es dueño del comportamiento; G1 aplica controles de borde; G2 revalida acceso a sus recursos. |
| RQ-01; FR-014–FR-024 | Consulta y edición atómica del perfil propio. | G2 es dueño del comportamiento; G1 expone las rutas; G3 aporta identidad/sesión validada. |
| SC-002–SC-004, SC-007 | Evidencia funcional, negativa, de seguridad y trazabilidad. | Cada grupo prueba su servicio; los tres participan en pruebas entre servicios. |
| SC-001, SC-005, SC-006 | Contratos consumibles, errores estructurados y evidencia de latencia backend. | G1 conserva evidencia de API; G2/G3 aportan resultados de sus operaciones. La medición completa es externa a este plan. |

### Estimación backend conservada

La fuente aprobada asigna 80 h al Sprint 1. Se excluyen las dos partidas exclusivamente ajenas a
este alcance, de 8 h y 10 h. Las partidas mixtas originales no tienen desglose suficiente para
reducirlas sin inventar horas; por ello 62 h es un techo conservador, no una distribución cerrada
por persona.

| Partida conservada | Horas | Responsabilidad |
|---|---:|---|
| Monorepo NestJS | 6 | G1 integra raíz; cada grupo configura su workspace. |
| Diseño de bases Users/Auth | 4 | G2 y G3, cada uno sobre su base. |
| `auth-service` | 16 | G3. |
| `users-service` | 12 | G2. |
| Docker Compose | 8 | Cada grupo aporta su servicio; G1 integra el archivo raíz. |
| API Gateway | 8 | G1. |
| Pruebas unitarias e integración | 8 | Cada grupo en su servicio; integración compartida según la matriz de pruebas. |
| **Total máximo conservado** | **62** | **Tres grupos; sin crear un equipo adicional.** |

## 2. Principios y restricciones arquitectónicas

### Límites de dominio y capas

- Cada aplicación separa `domain`, `application`, `infrastructure` e `interfaces`; el Gateway,
  que no posee dominio de negocio, usa `application`, `infrastructure`, `interfaces` y `modules`.
- El dominio no depende de NestJS, Prisma, HTTP, Redis ni PostgreSQL. Los controladores y DTOs
  traducen entradas; los casos de uso coordinan puertos; infraestructura implementa adaptadores.
- `users-service` posee `users_db`. `auth-service` posee `auth_db`. Ningún grupo consulta tablas
  del otro servicio ni crea claves foráneas entre bases.
- `userId` es un UUID estable compartido únicamente a través de contratos REST.
- `libs/contracts` puede compartir tipos de transporte, esquemas y códigos de error; no comparte
  entidades, repositorios, reglas de dominio ni modelos Prisma.

### Comunicación y seguridad

- Las operaciones del Sprint 1 requieren respuesta autoritativa inmediata y usan REST
  documentado. No se incorpora un broker asíncrono ni se crean eventos sin consumidor.
- Solo el Gateway expone HTTPS. Auth, Users, PostgreSQL y Redis permanecen en redes internas.
- Los endpoints internos usan service JWT breve, con issuer, audience y scope por llamador.
- Los JWT de usuario usan RS256 y claims mínimos: `sub`, `sid`, `role`, `jti`, `iss`, `aud`,
  `iat` y `exp`; no contienen correo, perfil ni secretos.
- El Gateway valida firma y claims e introspecciona `sid` en Auth. Users vuelve a validar el JWT
  antes de autorizar sus recursos y compara `sub` con el `userId` objetivo.
- Autenticación precede a autorización: token ausente, inválido o vencido produce `401`; una
  identidad autenticada sin permiso u ownership produce `403`.
- Entradas desconocidas o restringidas se rechazan antes del dominio. Los logs y respuestas no
  incluyen contraseñas, tokens, hashes, correos ni bytes de fotografías.

### Persistencia y consistencia

- Prisma ORM 6.x mantiene esquemas, clientes y migraciones independientes por servicio.
- PostgreSQL es autoridad para identidades, credenciales y sesiones. Redis 7 se limita a caché
  de sesiones y contadores antiabuso; nunca sustituye la persistencia autoritativa.
- Las operaciones locales son transaccionales. La consistencia Auth↔Users usa una saga REST
  durable e idempotente, no una transacción distribuida.
- Solo estados `ACTIVE` son visibles o autenticables. Estados `PENDING` son internos y deben
  converger a activación completa o cancelación.
- La foto acepta JPEG o PNG de máximo **5.000.000 bytes (5 MB decimales)**, conforme al spec.

### Comprobación constitucional

| Principio | Aplicación en este plan | Estado |
|---|---|---|
| Dominios | Gateway, Auth y Users tienen responsabilidades y contratos separados. | PASS |
| Capas | Dominio/aplicación no dependen de transporte ni persistencia. | PASS |
| Datos | Dos bases PostgreSQL, sin tablas ni FK compartidas. | PASS |
| Comunicación | REST para resultados inmediatos; timeouts, circuit breaker y fallo explícito. | PASS |
| Seguridad | HTTPS, JWT, service JWT, roles, ownership, validación y redacción. | PASS |
| Modularidad | TypeScript estricto y módulos cohesivos por servicio. | PASS |
| Contratos | OpenAPI público e interno con detección de drift. | PASS |
| Verificación | Unidad, integración, contrato, E2E, fallos y concurrencia. | PASS |
| Operación | Compose, healthchecks, migraciones, secretos y restart explícito. | PASS |

## 3. Grupo 1 — API Gateway

### Misión y límites

El Grupo 1 construye el único punto de entrada del Sprint 1 en `apps/api-gateway`. El Gateway se
implementa con NestJS porque el repositorio no contiene Nginx ni Kong, `tendencias.md` exige un
Gateway NestJS para el sprint y los artefactos vigentes ya cerraron esa decisión. No almacena
datos de negocio, no hashea contraseñas, no emite tokens y no modifica perfiles.

### Estructura y módulos

```text
apps/api-gateway/
├── src/
│   ├── application/
│   ├── infrastructure/{config,http,service-auth,observability}/
│   ├── interfaces/{http,openapi}/
│   └── modules/{routing,auth,users,rate-limit,health}/
├── test/{unit,integration,contract,e2e,performance,security}/
└── package.json
```

- `RoutingModule`: prefijo `/api/v1`, resolución de destinos y propagación segura de respuestas.
- `GatewayAuthModule`: Passport JWT, rutas públicas, introspección de sesión y guards.
- `RateLimitModule`: límites por origen confiable para registro y login.
- `UsersProxyModule`: forwarding de perfil y foto sin lógica de perfil.
- `ServiceAuthModule`: service JWT para llamar a Auth.
- `ObservabilityModule` y `HealthModule`: trazas, logs y estado operativo.

### Responsabilidades de implementación

- Terminar HTTPS, escuchar en el puerto público `8080` y no aceptar HTTP público alternativo.
- Exponer `/api/v1` y enrutar las operaciones según la tabla de integración de la sección 6.
- Eliminar todas las cabeceras de identidad o autenticación interna aportadas por el cliente.
- Propagar únicamente bearer validado, `traceId` y cabeceras permitidas.
- Validar JWT mediante Passport y confirmar en Auth que `sid` continúa activa y que el rol
  coincide con la sesión. Ante indisponibilidad de Auth, fallar cerrado con `503`.
- Aplicar protección de rutas, precedencia `401`/`403`, límites de cuerpo y streaming de foto.
- Implementar en Redis el límite de registro de 10 solicitudes por origen/10 minutos y el límite
  de login de 30 intentos por origen/5 minutos. Se cuenta todo intento; al exceder se devuelve
  `429` con `Retry-After`; las ventanas expiran automáticamente. Redis no disponible produce
  `503`, nunca acceso ilimitado.
- Obtener el origen desde la IP del socket; solo aceptar una dirección reenviada cuando el proxy
  inmediato esté en una allowlist configurada.
- Mapear errores de Auth/Users a Problem Details sin convertir un error remoto en éxito ni
  revelar datos sensibles.
- Mantener el OpenAPI público, incluido bearer, cookie, idempotencia, multipart, códigos de error
  y límites observables.

### Configuración, Docker y operación

El Grupo 1 mantiene `apps/api-gateway/src/infrastructure/config/`,
`infra/docker/gateway/Dockerfile` y la sección `api-gateway` de Compose. Sus variables incluyen
puerto, certificados TLS, URLs de Auth/Users, issuer/audience JWT, clave pública, credenciales de
service JWT, Redis, allowlist de proxies, límites de cuerpo/tasa y OTLP. La aplicación debe fallar
al iniciar si falta una configuración obligatoria.

### Pruebas propias

- Unidad: extracción de origen, mapeo Problem Details, políticas 401/403, cabeceras permitidas y
  cálculo de `Retry-After`.
- Integración: Passport, introspección, circuit breaker, rate limits, stripping de cabeceras y
  propagación de estados.
- Contrato: todos los endpoints de `openapi-public.yaml`, sus esquemas y errores.
- Seguridad: JWT manipulado/vencido, spoofing de cabeceras y ausencia de secretos/PII en logs.
- E2E: recorridos completos HTTPS una vez disponibles Auth y Users.

## 4. Grupo 2 — `users-service`

### Misión y límites

El Grupo 2 construye `apps/users-service` y es autoridad sobre identidad, correo, rol, estado de
registro, perfil, fotografía y versión del perfil. Cubre RQ-01 y la parte de RQ-02 que crea,
activa o cancela la identidad. No valida contraseñas, no implementa login, no emite access JWT ni
refresh tokens y no almacena sesiones.

### Estructura y módulos

```text
apps/users-service/
├── prisma/{schema.prisma,migrations/}
├── src/
│   ├── domain/{users,profiles,photos,roles}/
│   ├── application/{registration,login,profiles}/
│   ├── infrastructure/{config,persistence,files,observability}/
│   ├── interfaces/{http,openapi}/
│   └── modules/{users,profiles,roles,registration-state,login-lookup,photos,service-auth,health}/
├── test/{unit,integration,contract,security}/
└── package.json
```

### Modelo, persistencia y migraciones

- `User`: UUID, nombre, correo visible, correo normalizado único, rol
  `GUEST|OWNER|ADMIN`, estado `PENDING|ACTIVE|CANCELLED`, teléfono, preferencias, versión,
  `registrationId` y timestamps.
- `ProfilePhoto`: relación local 1:0..1 con User, bytes, media type, tamaño, SHA-256 y timestamp.
- `emailNormalized = trim().toLowerCase()` tiene índice único; solo usuarios `ACTIVE` participan
  en login o consultas de perfil.
- Las migraciones crean restricciones locales, índices y control de versión sin referencias a
  `auth_db`.
- Una actualización de perfil y fotografía se ejecuta en una transacción con
  `expectedVersion`; conflicto de versión o correo devuelve `409` sin cambios parciales.

### Casos de uso, DTOs y endpoints

- Crear identidad `PENDING` idempotente para un registro autorizado.
- Activar o cancelar una identidad por `registrationId`.
- Resolver para Auth un correo vigente devolviendo solo `userId`, rol y estado.
- Consultar perfil propio y servir su fotografía binaria.
- Actualizar nombre, correo, teléfono, foto y preferencias de forma atómica.
- Validar nombre 2–100 tras trim, correo válido máximo 254, teléfono E.164, hasta 20 preferencias
  escalares y foto JPEG/PNG máximo 5.000.000 bytes mediante magic bytes.
- Campo omitido conserva valor; `null` elimina teléfono, foto o preferencias; nombre/correo nulos
  y campos desconocidos o restringidos producen `400` y cero cambios.
- Revalidar JWT RS256 en las rutas de perfil y exigir `sub == userId`. Todo mismatch, incluido
  `ADMIN`, devuelve `403` antes de consultar la existencia del objetivo.
- Los guards de rol se prueban con metadata de prueba; no se crea una ruta productiva adicional
  solo para demostrar un rol no permitido.

Los controladores internos conservan los contratos existentes:

- Crear, activar y cancelar `/internal/v1/registrations`.
- Resolver `/internal/v1/login-identities/resolve`.
- GET/PATCH `/internal/v1/users/{userId}/profile`.
- GET `/internal/v1/users/{userId}/profile/photo`.

### Configuración, Docker y operación

El Grupo 2 mantiene `users_db`, sus credenciales, Prisma/migraciones,
`infra/docker/users/Dockerfile`, la sección `users-service` y su base en Compose. Configura puerto
`3002`, URL de base, clave pública/issuer/audience JWT, service-auth, máximo de carga y OTLP. Es
responsable de `/health/live` y `/health/ready`, migración antes de readiness y ejecución no root.

### Pruebas propias

- Unidad: correo, roles, estados, validadores de perfil/foto, null, ownership y versión.
- Integración PostgreSQL: unicidad/concurrencia, transacciones, rollback, migraciones y foto.
- Contrato: endpoints internos, DTOs, service JWT, bearer JWT, errores y Swagger.
- Seguridad: algoritmo/firma/issuer/audience/expiración, claims canónicos, acceso cruzado, mass
  assignment y ausencia de existencia diferenciable.

## 5. Grupo 3 — `auth-service`

### Misión y límites

El Grupo 3 construye `apps/auth-service` y es autoridad sobre credenciales, coordinación durable
del registro, sesiones, claves de firma y refresh tokens. Implementa autenticación y seguridad,
pero no almacena correo, nombre, teléfono, preferencias, rol vigente de usuario ni fotografías.
El rol copiado al crear una sesión permanece inmutable durante esa sesión.

### Estructura y módulos

```text
apps/auth-service/
├── prisma/{schema.prisma,migrations/}
├── src/
│   ├── domain/{credentials,registrations,sessions,tokens}/
│   ├── application/{registration,login,sessions}/
│   ├── infrastructure/{config,persistence,security,http,cache,observability}/
│   ├── interfaces/{http,openapi}/
│   └── modules/{registration,credentials,login,sessions,tokens,service-auth,health}/
├── test/{unit,integration,contract,security}/
└── package.json
```

### Modelo, persistencia y migraciones

- `Credential`: `userId` externo sin FK, hash Argon2id, estado
  `PENDING|ACTIVE|REVOKED` y timestamps.
- `Registration`: UUID de `Idempotency-Key`, fingerprint seguro del request, `userId` estable,
  estado durable, intentos, error seguro, `expiresAt` y timestamps.
- `Session`: UUID, `userId`, rol inmutable capturado al login, expiración absoluta, revocación y
  versión de concurrencia.
- `RefreshToken`: hash/HMAC único, estado `ACTIVE|CONSUMED|REVOKED`, expiración y sucesor.
- Las migraciones e índices pertenecen exclusivamente a `auth_db`.

### Casos de uso, seguridad y endpoints

- `POST /auth/register`: coordinar la saga Auth↔Users, validar contraseña exacta de 8–128
  caracteres, aceptar solo `GUEST|OWNER`, generar UUID estable, hashear con Argon2id y responder
  éxito solo cuando identidad y credencial estén `ACTIVE`.
- `POST /auth/login`: normalizar correo para lookup en Users, aplicar coste comparable a cuenta
  inexistente, verificar Argon2id y crear sesión/tokens sin enumerar cuentas.
- `POST /auth/refresh`: consumir cookie segura, rotar el token bajo lock transaccional, mantener
  el límite absoluto de siete días y revocar la familia ante replay.
- `GET /auth/validate`: validar sesión y devolver a Gateway `active` y rol autoritativo de la
  sesión; PostgreSQL manda y Redis solo cachea con fallback.
- Emitir access JWT RS256 de 3600 segundos con `kid`, issuer/audience fijos y claims mínimos.
- El límite de Auth para login es 5 fallos por HMAC del correo normalizado/15 minutos para
  cuentas existentes o inexistentes. Un éxito limpia ese contador; Redis no disponible produce
  `503`; el sexto fallo devuelve `429` con `Retry-After` genérico.
- DTOs y `ValidationPipe` rechazan campos desconocidos. Errores usan Problem Details y nunca
  exponen credenciales, tokens, hashes o existencia de cuenta.

### Reconciliación del registro

Auth es dueño del reconciliador; no se delega al Gateway ni a Users.

- Una ejecución programada cada 30 segundos reclama lotes mediante bloqueo transaccional con
  `SKIP LOCKED`, permitiendo réplicas sin procesar la misma fila simultáneamente.
- Un registro `PENDING` expira 15 minutos después de su creación. Antes de expirar, el
  reconciliador reintenta pasos idempotentes con un máximo de cinco intentos y backoff.
- Si ambos lados están completos, finaliza `COMPLETED`; si no puede completarse al vencer o
  agotar intentos, pasa por `COMPENSATING` y termina `CANCELLED`.
- La compensación nunca elimina una identidad ya expuesta: solo opera sobre estados internos no
  autenticables. Fallos del reconciliador se registran sin payload sensible y se reintentan en
  la siguiente ejecución.
- Intervalo, TTL, tamaño de lote e intentos se exponen como configuración validada para pruebas
  y operación, manteniendo los valores anteriores como defaults del Sprint 1.

### Configuración, Docker y operación

El Grupo 3 mantiene `auth_db`, Redis para sus contadores/caché, Prisma/migraciones,
`infra/docker/auth/Dockerfile`, la sección `auth-service` y su base en Compose. Configura puerto
`3001`, URL de base, Redis, Argon2id, claves RS256, issuer/audience, service-auth, sesión,
reconciliador y OTLP. Es responsable de healthchecks, migración previa, secretos y usuario no
root.

### Pruebas propias

- Unidad: contraseña exacta, Argon2id, saga, idempotencia, login genérico, claims, expiración,
  refresh, replay y reconciliación.
- Integración PostgreSQL/Redis: locks, refresh concurrente, fallos de caché, límites antiabuso,
  reintentos, expiración y compensación de registros pendientes.
- Contrato: registro, login, refresh, validación de sesión, service JWT, errores y Swagger.
- Seguridad: algoritmos permitidos, rotación de claves, secreto ausente en logs y respuestas.

## 6. Contratos e integración entre servicios

Esta sección coordina a los tres grupos; no constituye un cuarto equipo. Antes de implementar
comportamiento, los grupos congelan juntos la versión inicial de:

- `contracts/openapi-public.yaml`, propiedad pública del Grupo 1 con revisión de G2 y G3.
- `contracts/openapi-auth-service.yaml`, propiedad del Grupo 3 con revisión de G1.
- `contracts/openapi-users-service.yaml`, propiedad del Grupo 2 con revisión de G1 y G3.
- `libs/contracts`, integrado por G1; cada servicio aprueba únicamente los DTOs y códigos que
  consume o produce.

### Enrutamiento y responsabilidades

| Petición al Gateway | Destino inmediato | Responsabilidad final |
|---|---|---|
| `POST /api/v1/auth/register` | Auth | G3 coordina; G2 crea/activa identidad; G1 limita, valida forma y propaga. |
| `POST /api/v1/auth/login` | Auth | G3 autentica; G2 resuelve identidad vigente; G1 aplica límite por origen y cookie de salida. |
| `POST /api/v1/auth/refresh` | Auth | G3 rota/revoca; G1 entrega y limpia cookie. |
| `GET /api/v1/auth/validate` | Auth | G1 valida JWT e invoca introspección; G3 confirma sesión/rol. |
| `GET /api/v1/users/{userId}/profile` | Users | G1 autentica/introspecciona; G2 revalida JWT/ownership y consulta. |
| `PATCH /api/v1/users/{userId}/profile` | Users | G1 protege y enruta multipart; G2 valida y actualiza atómicamente. |
| `GET /api/v1/users/{userId}/profile/photo` | Users | G1 protege y transmite; G2 autoriza y sirve binario. |

### Flujo coordinado de registro RQ-02

1. G1 recibe HTTPS, aplica tamaño/rate limit, exige `Idempotency-Key` UUID y envía a Auth con
   service JWT y `traceId`.
2. G3 crea o reanuda `Registration`, asigna `userId` estable y solicita a Users crear la
   identidad `PENDING` mediante REST autenticado.
3. G2 normaliza correo, aplica unicidad y crea User/Profile `PENDING` en una transacción.
4. G3 crea Credential `PENDING`, activa credencial y solicita a G2 activar la identidad.
5. G3 responde éxito solo cuando ambos lados están `ACTIVE`; timeout reanuda la misma saga.
6. El reconciliador de G3 completa o compensa estados incompletos. G2 expone operaciones
   idempotentes para consultar/activar/cancelar, pero no coordina la saga.

### Datos intercambiados

- Registro G3→G2: `registrationId`, `userId`, nombre, correo y rol público; nunca contraseña.
- Login G3→G2: correo normalizado; G2→G3: `userId`, rol y estado; nunca perfil completo.
- Introspección G1→G3: `sid`/JWT validado; G3→G1: `active` y rol de sesión.
- Perfil G1→G2: bearer validado, `traceId`, `userId`, DTO y foto; no cabeceras de identidad
  aportadas por el cliente.

### Autenticación y errores entre servicios

- G1→Auth, G3→Users y cualquier llamada interna autorizada usan service JWT con claves,
  issuer, audience y scope separados por llamador. Las rutas de perfil reciben además el bearer
  del usuario, que Users revalida.
- Clientes REST tipados aplican timeout y circuit breaker. Solo se reintentan operaciones
  idempotentes o protegidas por `Idempotency-Key`.
- `400`, `401`, `403`, `404`, `409`, `413`, `415`, `429` y `503` conservan semántica común en
  Problem Details. Un timeout o dependencia autoritativa caída produce `503` y cero mutaciones
  confirmadas.
- Las rutas de perfil documentan y prueban `503` cuando Users no responde; registro/login
  documentan `503` ante fallos de su dependencia autoritativa.

## 7. Infraestructura Docker

Cada grupo es responsable de que su aplicación se construya, migre, arranque y reporte salud.
G1 integra el `docker-compose.yml` raíz, pero no implementa contenedores ajenos.

| Componente | Responsable | Obligaciones |
|---|---|---|
| `api-gateway` | G1 | Dockerfile multi-stage, puerto 8080 HTTPS, healthchecks, secretos TLS/JWT, Redis y rutas internas. |
| `users-service` + `users-db` + `users-migrate` | G2 | Dockerfile, puerto interno 3002, volumen/credenciales propios, migración Prisma y readiness. |
| `auth-service` + `auth-db` + `auth-migrate` | G3 | Dockerfile, puerto interno 3001, volumen/credenciales propios, migración Prisma y readiness. |
| Redis | G3 para Auth; G1 para límites de borde | Namespaces/credenciales separados, healthcheck y comportamiento de fallo cerrado/fallback documentado. |
| Collector y Loki | G1 integra; G2/G3 instrumentan | OTLP, correlación por `traceId`, retención y redacción. |
| Compose raíz y `.env.example` | G1 integra; G2/G3 aportan variables | Redes internas, startup por salud/migración, secretos, volúmenes y restart explícito. |

Reglas comunes:

- Node.js 20, imágenes multi-stage, `npm ci`, lockfile y usuario no root.
- `prisma migrate deploy` mediante jobs; nunca `db push` en runtime.
- Solo Gateway publica puerto. Auth, Users, bases y Redis no se exponen al host.
- Auth y Gateway usan `restart: always`; los demás componentes declaran política explícita.
- Secretos y certificados no se versionan; `.env.example` contiene solo nombres y ejemplos no
  sensibles.
- `/health/live` informa proceso vivo; `/health/ready` exige configuración y dependencias
  necesarias para aceptar tráfico.

## 8. Estrategia de pruebas

### Responsabilidad por grupo

| Nivel | G1 — Gateway | G2 — Users | G3 — Auth |
|---|---|---|---|
| Unidad | Routing, guards, rate limit, errores, cabeceras. | Dominio de identidad/perfil/foto/ownership. | Credenciales, saga, sesión, JWT, refresh/reconciliador. |
| Integración | Redis, Passport, clientes REST, TLS y fallos remotos. | Prisma/PostgreSQL, transacciones, migraciones y concurrencia. | Prisma/PostgreSQL, Redis, locks, rotación y compensación. |
| Contrato | OpenAPI público y drift. | OpenAPI Users y DTOs producidos. | OpenAPI Auth y DTOs producidos. |
| Seguridad | Spoofing, JWT rechazado y redacción de borde. | JWT directo, acceso cruzado y mass assignment. | Enumeración, secretos, replay y claves. |

### Pruebas entre servicios

| Integración | Participantes | Evidencia obligatoria |
|---|---|---|
| Gateway ↔ Auth | G1 ejecuta harness; G3 mantiene stub/servicio y contrato | Registro/login/refresh/validate; timeout, `401`, `429`, `503`, cookie y rol de sesión. |
| Gateway ↔ Users | G1 ejecuta harness; G2 mantiene stub/servicio y contrato | Perfil/foto, multipart, streaming, ownership, timeout/circuit breaker y `503` sin mutación. |
| Auth ↔ Users | G3 ejecuta saga/login; G2 mantiene endpoints y fixtures | Registro completo, idempotencia, correo duplicado, lookup, timeout, crash, reintento y compensación. |
| E2E de Sprint 1 | G1 coordina; G2/G3 corrigen sus servicios | HTTPS: registro, login, perfil, cambio de correo, refresh, negativos, concurrencia y replay. |

Las pruebas se escriben antes del comportamiento correspondiente y deben fallar por la razón
esperada. Se usa PostgreSQL 16 real para integración, Supertest/Jest para HTTP y k6 versionado
para rendimiento. CI exige al menos 70% de cobertura del código afectado sin sustituir suites de
comportamiento, integración, seguridad o concurrencia.

El perfil k6 usa HTTPS sobre Compose, 100 usuarios `ACTIVE`, 30 segundos de calentamiento y dos
escenarios simultáneos de 25 solicitudes/s durante dos minutos para consulta de perfil y
validación de acceso. Cada operación exige p95 menor de 500 ms y errores inesperados menores de
1%; se registran commit, runner, recursos, fecha, versión/digest y resultados.

## 9. Dependencias y paralelización

### Fase 0 — Contratos antes de implementar

Los seis integrantes acuerdan primero versiones iniciales de OpenAPI, Problem Details, roles,
claims, service JWT, DTOs y códigos. G1 integra el paquete compartido; G2 y G3 aprueban sus
fronteras. Ningún grupo espera la implementación de otro para crear su workspace, dominio,
adaptadores o pruebas contra mocks generados desde estos contratos.

### Trabajo paralelo inicial

- G1: workspace Gateway, HTTPS/configuración, routing, rate limits, cliente Auth/Users, OpenAPI
  público, Dockerfile y pruebas con stubs.
- G2: workspace Users, dominio/modelo, esquema/migración, casos de registro/perfil, guards,
  OpenAPI Users, Dockerfile y pruebas locales.
- G3: workspace Auth, dominio/modelo, esquema/migración, credenciales/sesiones, JWT/refresh,
  reconciliador, OpenAPI Auth, Dockerfile y pruebas locales.

### Dependencias explícitas

```text
Contratos v1 aprobados por G1 + G2 + G3
├── G1 puede implementar Gateway contra stubs
├── G2 puede implementar Users y su base
└── G3 puede implementar Auth y su base

G2 registro interno listo ───────┐
                                 ├── G3 integra saga de registro
G3 orquestador/credencial listo ─┘              │
                                                └── G1 integra POST /auth/register

G2 lookup de identidad listo ────┐
                                 ├── G3 integra login
G3 login/sesiones listo ─────────┘              │
                                                └── G1 integra login/refresh/validate

G3 introspección lista ──────────┐
G2 perfil/guards listos ─────────┼── G1 integra rutas de perfil
G1 auth/routing listo ───────────┘
```

### Orden de integración

1. Validar service JWT y healthchecks entre contenedores.
2. Integrar Auth↔Users para registro y lookup; ejecutar fallos, reintentos y reconciliación.
3. Integrar Gateway↔Auth para registro, login, refresh, validate y límites de borde.
4. Integrar Gateway↔Users con introspección Auth para perfil/foto y prueba automatizada de
   indisponibilidad de Users.
5. Ejecutar E2E, seguridad, rendimiento, OpenAPI drift y verificación Compose completa.

Las revisiones de contratos son conjuntas, pero cada cambio tiene un único responsable: G1 para
el contrato público, G2 para Users y G3 para Auth. Un cambio incompatible no se integra hasta
actualizar consumidor, productor, prueba de contrato y OpenAPI en el mismo corte.

## 10. Criterios técnicos de terminado

### Grupo 1 — API Gateway

- Gateway NestJS arranca por HTTPS en Compose, expone solo `/api/v1` y enruta todos los endpoints
  definidos sin lógica de dominio.
- Validación/introspección, guards, stripping de cabeceras, límites por origen, `Retry-After`,
  errores y `503` funcionan y están probados.
- OpenAPI público coincide con el comportamiento y las pruebas Gateway pasan.
- Dockerfile, configuración, healthchecks, logs y variables del Gateway están documentados.

### Grupo 2 — `users-service`

- `users_db` migra reproduciblemente y ninguna tabla es compartida con Auth.
- Registro parcial, lookup, perfil, foto, validaciones, ownership y atomicidad cumplen
  RQ-01/parte de RQ-02 y FR aplicables.
- El límite de foto es exactamente 5.000.000 bytes y sus casos límite están probados.
- OpenAPI Users, pruebas unitarias/integración/contrato/seguridad y contenedor pasan.

### Grupo 3 — `auth-service`

- `auth_db` migra reproduciblemente; contraseñas y tokens solo se conservan como hashes seguros.
- Registro, login, JWT, refresh, introspección, rate limit por identificador y reconciliación
  cumplen RQ-02 y FR aplicables.
- Rotación, replay, límite absoluto, concurrencia y convergencia de `PENDING` están probados.
- OpenAPI Auth, pruebas unitarias/integración/contrato/seguridad y contenedor pasan.

### Cierre conjunto

- Gateway↔Auth, Gateway↔Users y Auth↔Users pasan sus suites, incluidos timeouts, dependencias
  caídas, `503`, reintentos seguros y ausencia de cambios parciales.
- Los tres documentos OpenAPI no tienen drift y describen autenticación, autorización, DTOs,
  restricciones y errores.
- `docker compose up` levanta Gateway, Auth, Users, bases, Redis y observabilidad mediante
  healthchecks y migraciones; solo Gateway queda expuesto.
- CI pasa lint, tipos, unidad, integración, contrato, E2E, seguridad, cobertura y build de
  contenedores.
- Existe trazabilidad RQ-01/RQ-02 → FR → contrato → prueba y no se declara completa evidencia
  externa que este plan no ejecuta.
- Logs centralizados y stdout correlacionan `traceId` sin secretos ni PII.
- Un integrante ajeno al cambio registra revisión de cumplimiento constitucional, alcance,
  contratos y criterios de aceptación.

Con esta matriz, cada actividad del Sprint 1 tiene un grupo responsable: G1 integra el borde y
los artefactos raíz, G2 entrega Users y `users_db`, G3 entrega Auth y `auth_db`, y las pruebas
entre servicios declaran expresamente participantes y dueño de ejecución.
