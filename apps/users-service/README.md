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
La integración final con Auth/Gateway requiere sus entregables y revisión contractual.

## Nota para Windows con Docker Desktop

En `USERS_TEST_DATABASE_URL` usa `127.0.0.1` en lugar de `localhost` para el
PostgreSQL desechable publicado por Docker Desktop. La resolución IPv6 de
`localhost` puede provocar el error Prisma P2028 durante las pruebas transaccionales.
Ejemplo sin credenciales reales:
`postgresql://users:TEST_ONLY@127.0.0.1:55432/users_db`.
El puerto y las credenciales deben coincidir con el contenedor de pruebas.
No es necesario aumentar `maxWait` ni `timeout` de las transacciones por este caso.
