# users-service

Servicio del Grupo 2. Es la autoridad sobre identidad, correo, rol, estado de registro, perfil,
foto y versión del perfil. Posee `users_db`. No almacena contraseñas, hashes, sesiones ni
refresh tokens, no implementa login y no emite access JWT.

- Puerto interno: `3002` (solo red interna de Compose; nunca se publica al host).
- Contrato: `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`.
- Backlog: `specs/001-fundamentos-identidad/tasks/tasks_userService.md`.

## Variables de entorno

Todas son obligatorias; el servicio no arranca si falta alguna o es inválida. Los valores de
`.env.example` son ejemplos no sensibles. Las claves PEM y contraseñas reales se inyectan como
secretos y nunca se versionan.

| Variable | Descripción |
|---|---|
| `USERS_PORT` | Puerto HTTP interno. Debe ser `3002`. |
| `USERS_DB_PASSWORD` | Contraseña del rol `stayhub_users` de `users_db` (usada por Compose). |
| `USERS_DATABASE_URL` | URL `postgresql://` de `users_db`. Ninguna otra base es accesible. |
| `USERS_JWT_PUBLIC_KEYS_JSON` | Objeto JSON `kid -> PEM` con las claves públicas RS256 de Auth para validar el bearer de usuario. |
| `USERS_JWT_ISSUER` | Issuer esperado del access JWT. |
| `USERS_JWT_AUDIENCE` | Audience esperada del access JWT. |
| `USERS_SERVICE_AUTH_PUBLIC_KEYS_JSON` | Objeto JSON `kid -> PEM` con las claves públicas del service JWT de Auth. |
| `USERS_SERVICE_AUTH_ISSUER` | Issuer esperado del service JWT. |
| `USERS_SERVICE_AUTH_AUDIENCE` | Audience esperada del service JWT. |
| `USERS_SERVICE_AUTH_REGISTRATION_SCOPE` | Scope exigido en create/activate/cancel de registro. |
| `USERS_SERVICE_AUTH_LOOKUP_SCOPE` | Scope exigido en el lookup de identidad para login. Distinto del de registro. |
| `USERS_MAX_PHOTO_BYTES` | Límite de foto. Debe ser exactamente `5000000`. |
| `USERS_OTLP_ENDPOINT` | Endpoint OTLP HTTP del collector. |
| `USERS_OTEL_SERVICE_NAME` | Nombre del servicio en trazas y logs. |
| `NODE_ENV` | `development`, `test` o `production` (por defecto `development`). |

Los valores de scope deben coincidir con los que emite `auth-service`; acordarlos con G3.

## Comandos

Desde la raíz del repositorio:

```powershell
npm run build:users
npm run lint:users
npm run typecheck:users
npm run test:users
npm run prisma:users:generate
npm run prisma:users:migrate:dev
npm run prisma:users:migrate:deploy
```

Las migraciones se aplican solo con `prisma migrate deploy` desde el job `users-migrate`.
`prisma db push` está prohibido en cualquier entorno.
