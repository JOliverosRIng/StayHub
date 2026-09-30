# Users service — Grupo 2

Node 20, NestJS 10, TypeScript estricto, Prisma 6 y PostgreSQL 16. Users es dueño de
`users_db`, identidad, correo, rol, estado de registro, perfil y foto. No almacena
credenciales ni sesiones. El puerto 3002 solo se utiliza en la red interna de Compose.

La configuración está en `.env.example`: issuer, audience, kid y clave RSA pública se
configuran por separado para bearer y service JWT. Los scopes de registro y lookup
también son distintos. La foto tiene un límite exacto de 5.000.000 bytes. OTLP apunta al
Collector integrado por G1; stdout conserva JSON seguro si el Collector no responde.
Variables terminadas en `_FILE` cargan secretos desde archivos; no se versionan claves
ni URLs con credenciales. Users solo necesita claves públicas, nunca claves privadas.

Desde la raíz: `npm ci`, `npm run prisma:users:generate`, `npm run build:users`,
`npm run lint:users`, `npm run typecheck:users`, `npm run test:users`.
`npm run prisma:users:migrate:dev -- --name descripcion` crea migraciones en desarrollo;
`npm run prisma:users:migrate:deploy` aplica las versionadas. No se utiliza `db push`.

Las suites integration y contract requieren PostgreSQL 16 aislado y migraciones reales.
La integración con Auth está verificada sin Gateway: Auth usa Users real para registro
(`POST`, `GET /internal/v1/registrations/{registrationId}`, `activate`, `cancel`, scope
`users:registration`) y login (`POST /internal/v1/login-identities/resolve`, scope
`users:login-identity`), y Users acepta el access JWT de Auth (RS256, `kid`/`iss`/`aud` de Auth,
solo la clave pública). Evidencia: `npm run test:auth-users` y
`agents/integracion/resultado.md`. El control de sesiones revocadas antes del perfil y la revisión
contractual con Gateway siguen pendientes, porque dependen de Gateway.

## Prueba manual con Swagger (integración con Auth)

`npm run dev:swagger` (raíz) levanta Auth y Users reales con PostgreSQL/Redis en contenedores y
publica Users en `http://127.0.0.1:3002/docs`. En `development` el server de "Try it out" es
`USERS_SWAGGER_SERVER_URL` (el script nativo lo fija a `http://127.0.0.1:3002`). Para el perfil,
usa como bearer el `accessToken` devuelto por `POST /internal/v1/login` de Auth. Guía completa:
[docs/dev-swagger.md](../../docs/dev-swagger.md).

## Nota para Windows con Docker Desktop

En `USERS_TEST_DATABASE_URL` usa `127.0.0.1` en lugar de `localhost` para el
PostgreSQL desechable publicado por Docker Desktop para usar explícitamente IPv4.
Esto no evita un P2028 causado por expiración de una transacción.
Ejemplo sin credenciales reales:
`postgresql://users:TEST_ONLY@127.0.0.1:55432/users_db`.
El puerto y las credenciales deben coincidir con el contenedor de pruebas.
La actualización atómica de perfil/foto tiene un timeout explícito de 15.000 ms:
una escritura válida de 5.000.000 bytes puede superar los 5.000 ms predeterminados
en un host lento. `maxWait` y los timeouts de otras transacciones no cambian.
Los fallos de esta operación registran `dependency_unavailable`, `profile.update`
y el código Prisma (por ejemplo, `P2028`), sin serializar el error ni datos personales.
El plazo sigue siendo finito; excederlo conserva el rollback y la respuesta 503.
