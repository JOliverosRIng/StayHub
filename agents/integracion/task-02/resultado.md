# Task 02 — JWT y configuración persistente compartida — Resultado

Estado: COMPLETA

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7`. El `engines` del proyecto pide
`>=20 <21`; se registra la diferencia (solo warnings de npm, todo ejecutó igual).
Prisma Client `6.19.0` (generado para ambos servicios). No se leyeron ni imprimieron
secretos de `.env` en este informe; `.env` y `secrets/` están ignorados por git.

## 1. Dependencias leídas y estado comprobado

- `agents/integracion/CONTEXTO.md`, `agents/integracion/PLAN.md` (índice) y
  `agents/integracion/task-02/PLAN.md`.
- Dependencia **task-01**: leído `task-01/resultado.md`; `Estado: COMPLETA` y fila 01
  del índice en COMPLETA. El GET
  `GET /internal/v1/registrations/{registrationId}` ya existe con scope
  `users:registration`.
- Estado real confirmado en código: `.env.example` seguía con
  `AUTH_OUTBOUND_SERVICE_SCOPE=users:identity` y el bloque Users con issuer/kid
  propios (`stayhub-auth`, `access-v1`, servicio `stayhub-users`).
  `scripts/generate-auth-dev-env.mjs` generaba un único `.env` apuntando a
  `http://users-stub:4000` y no producía la configuración de Users.
- `git status --short` inicial: cambios de task-01 en `apps/users-service` y
  `openapi-users-service.yaml`, más `agents/`, `guia/`, `guia-v2/` e `integracion.sh`
  sin rastrear. No se tocó nada de eso. No existía `.env` ni `secrets/`.

## 2. Archivos cambiados y decisiones

Código y configuración:

1. `.env.example` — alineado a la tabla B1:
   `AUTH_OUTBOUND_SERVICE_SCOPE=users:registration users:login-identity`; el bloque
   Users replica kid/issuer/audience de Auth
   (`stayhub-auth-2026-01`, `https://auth.stayhub.internal`, `stayhub-api`) y del
   JWT de servicio (`auth-users-2026-01`, `stayhub-auth-service`,
   `stayhub-users-service`). Se mantienen separados `USERS_REGISTRATION_SCOPE` y
   `USERS_LOOKUP_SCOPE`.
2. `scripts/lib/dev-env.mjs` (nuevo) — helper reutilizable compartido.
   - Constantes B1 (`ACCESS_KID`, `OUTBOUND_KID`, issuers, audiences y scopes).
   - `rsaPair()`, `secret()`, `derivePublicKey()`, `parseEnv()`, `SECRET_FILES`.
   - `ensureDevEnvironment({ root, examplePath })`: fuente única de verdad = `.env`
     de la raíz. Si no existe, genera 3 pares RSA (access, Auth→Users, gateway de
     pruebas), secretos HMAC, password de Auth y de Users, escribe los archivos que
     Compose requiere y redacta `.env` desde `.env.example`. Si ya existe, valida la
     correspondencia B1, deriva las públicas desde las privadas y reutiliza sin
     sobrescribir; ante incoherencia lanza `DevEnvConflictError` y **no** escribe
     nada.
3. `scripts/generate-auth-dev-env.mjs` — reescrito sobre el helper. Acepta
   `--root` y `--example` (para ejecutarlo aislado en pruebas), no imprime valores
   secretos y devuelve código de salida 1 en conflicto. Conserva el nombre del script
   raíz `env:auth:dev`.
4. `apps/auth-service/test/unit/dev-env-generator.spec.ts` (nuevo) — pruebas
   dirigidas de la configuración: alineación B1 del ejemplo, coherencia de las
   claves (pública derivada == archivo), permisos `0600`, ausencia de claves
   privadas en variables `USERS_*`, carga real con `loadAuthConfig` y
   `loadUsersConfig`, idempotencia sin rotación y no-sobrescritura ante conflicto.
5. `apps/auth-service/test/security/service-trust.spec.ts` (nuevo) — B2 dirigido con
   **emisor real** (`UsersServiceTokenProvider`) y **verificador real de Users**
   (`verifyJwt`): acepta el token con ambos scopes; rechaza clave ajena, kid,
   issuer y audience distintos; el access JWT no sirve para registro interno y el
   JWT de servicio no sirve como JWT de perfil.

Generados (ignorados por git, no forman parte del diff):

- `.env` (modo `0600`) y `secrets/` (modo `0700`): `access-public.pem`,
  `service-public.pem`, `gateway-public.pem`, `gateway-private.pem`,
  `users-db-password.txt`, `users-database-url.txt`.

Decisiones:

- Se mantiene un único `.env` en la raíz como fuente para la interpolación de
  Compose y como `env_file` de Auth; Users no recibe claves privadas, solo las
  públicas por `_FILE` y los secretos de su base.
- La privada del llamador de pruebas Gateway→Auth se conserva en
  `secrets/gateway-private.pem` para que task-03 pueda firmar su service JWT sin
  rotarlo entre reinicios. Su pública queda inline en Auth.
- El par del llamador Gateway→Auth sigue separado del access JWT y del JWT
  Auth→Users (tres pares distintos).
- No se modificó el arranque de procesos ni Compose (reservado a task-03/04); el
  helper queda listo para que ambos modos lo consuman.

## 3. Contrato de configuración generado (sin valores secretos)

```text
Auth access JWT   : kid=stayhub-auth-2026-01
                    iss=https://auth.stayhub.internal aud=stayhub-api
Auth->Users JWT   : kid=auth-users-2026-01
                    iss=stayhub-auth-service aud=stayhub-users-service
                    scope=users:registration users:login-identity ttl=60s
Users access JWT  : kid/issues/audience = Auth access JWT (pública access-public.pem)
Users service JWT : kid/issues/audience = Auth->Users (pública service-public.pem)
Scopes Users      : registration=users:registration lookup=users:login-identity
URLs              : USERS_SERVICE_URL=http://users-service:3002
```

## 4. Comandos, códigos de salida y resultados reales

Configuración (raíz):

```sh
npm run env:auth:dev            # exit 0; genera .env + secrets/ (primera vez)
npm run env:auth:dev            # exit 0; "reutilizado", hashes idénticos (sin rotación)
```

Aislamiento y conflicto (carpeta temporal, ejemplo real):

```sh
node scripts/generate-auth-dev-env.mjs --root <tmp> --example .env.example   # exit 0
# segunda ejecución                                                        # exit 0, idempotente
# .env con AUTH_OUTBOUND_SERVICE_SCOPE=users:identity                       # exit 1,
#   mensaje "conflicto", ningún archivo modificado
```

Pruebas y comprobaciones:

```sh
npm run test:auth:unit      # 18 suites, 146 tests, 0 fallos, exit 0
npm run test:auth:security  # 4 suites, 66 tests, 0 fallos, exit 0
npm run test:users:security # 3 suites, 35 tests, 0 fallos, exit 0
npm run typecheck:auth      # exit 0
npm run lint:auth           # exit 0
npm run typecheck:users     # exit 0
npm run lint:users          # exit 0
npm run build:auth          # exit 0
```

Nota de reproducibilidad: un primer `typecheck:auth` falló por Prisma Client no
generado (`Prisma.TransactionIsolationLevel`). Tras
`npm run prisma:auth:generate` y `npm run prisma:users:generate` (exit 0) el
typecheck quedó limpio; no era un problema de esta tarea.

## 5. Escenarios acreditados y pendientes

Acreditados (task-02):

- `.env.example` cumple la correspondencia B1 entre Auth y Users.
- La configuración generada es coherente: la pública de Users corresponde a la
  privada de Auth en ambos pares; kids/issuers/audiences alineados; scopes
  distintos y correctos.
- `loadAuthConfig` y `loadUsersConfig` cargan el `.env` generado; Users solo ve
  claves públicas y su base `users_db`.
- Segunda ejecución sin sobrescritura ni rotación de claves/secretos; conflicto
  detectado sin modificar archivos.
- Emisor real `UsersServiceTokenProvider` con scope conjunto autoriza en el
  verificador real de Users; clave/kid/issuer/audience incorrectos son rechazados;
  un token no sirve para el otro tipo de acceso.

Pendientes / fuera de alcance (no bloquean task-02):

- Recorrido HTTP real login de Auth→perfil en Users y registro a través de Auth:
  task-05/task-06. En task-02 la evidencia es dirigida (emisor y verificador
  reales), no un recorrido extremo a extremo.
- Sustituir `users-stub` en `dev:swagger`/`dev:swagger:docker`, alinear el script
  nativo y Compose: task-03 y task-04 (hoy siguen apuntando al stub con
  `users:identity`).
- Regresión completa `test:auth`, `test:users` con PostgreSQL/Redis y cobertura:
  task-08 (aquí solo suites dirigidas sin base).

## 6. Recursos temporales creados y limpieza

- Carpeta temporal `/tmp/opencode/dev-env-test` y directorios `mkdtemp` de Jest:
  eliminados. Las pruebas limpian en `afterEach`.
- `.env` y `secrets/` de la raíz se generaron a propósito (ignorados por git) para
  que task-03 los reutilice; no se borraron.
- No se alteraron bases de datos, contenedores ni datos previos. No se eliminaron
  dobles de pruebas.

## 7. Instrucciones para task-03 (no ejecutada)

- Reutilizar `scripts/lib/dev-env.mjs` (`ensureDevEnvironment`, `SECRET_FILES` y
  constantes B1); no generar claves nuevas ni tocar el `.env` persistente.
- Arranque nativo: dejar de llamar a `startUsersStub`; arrancar Users real en 3002
  con `USERS_SERVICE_URL=http://127.0.0.1:3002`; sustituir el `npm run
  prisma:generate` inexistente por `prisma:auth:generate` y `prisma:users:generate`;
  aplicar migraciones de ambos servicios y esperar readiness de los dos.
- Para el service JWT de desarrollo, firmar con `secrets/gateway-private.pem`
  (kid `gateway-dev-2026-01`, iss `stayhub-dev-gateway`, aud
  `stayhub-auth-service-dev`, scope `auth:invoke`). No imprimir el token en
  informes.
- El token de Auth→Users ya lleva `users:registration users:login-identity`; no
  unificar los scopes de Users. Retirar `--users-port` del stub con error
  explicativo. No modificar aún el modo `--service-container`.
