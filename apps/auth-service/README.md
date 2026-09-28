# StayHub auth-service

Servicio interno NestJS responsable exclusivamente de credenciales, coordinación durable de
registro, sesiones y tokens. Escucha en el puerto interno `3001`; no debe publicarse al host.

## Límites

- Persiste solo `Credential`, `Registration`, `Session` y `RefreshToken` en `auth_db`.
- No persiste correo, nombre, perfil, preferencias, foto ni rol vigente de Users.
- Consume Users por REST autenticado con un service JWT de audiencia y clave independientes.
- PostgreSQL es autoritativo para sesiones; Redis se limita a contadores y caché acotada.

## Comandos

```powershell
npm ci
npm run prisma:generate
npm run build
npm run lint
npm run typecheck
npm test
```

Las migraciones productivas se aplican con `npm run prisma:migrate:deploy`. `prisma db push` no
forma parte del arranque ni de los scripts del servicio.

## Configuración

Todas las variables están enumeradas en `/.env.example`. El arranque falla si falta una URL de
base/Redis, un parámetro criptográfico, una clave, issuer/audience/scope, configuración de
sesión/reconciliación o endpoint OTLP. Los secretos reales y certificados nunca se versionan.

