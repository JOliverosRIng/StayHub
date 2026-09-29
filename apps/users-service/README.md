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
