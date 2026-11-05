# Accommodations service — Sprint 2

Node 20, NestJS 10, TypeScript estricto, Prisma 6 y PostgreSQL 16. El servicio es dueño de
`accommodations_db` y del almacenamiento local de fotos: propiedades, habitaciones, tarifa base por
noche, catálogo de características, metadatos de fotos y estado de publicación. Escucha solo en el
puerto interno `3003`. `ownerId` es el `sub` del JWT y no es una FK hacia Users.

Fuentes de verdad: `specs/002-alojamientos/spec.md`, `data-model.md`,
`contracts/openapi-accommodations-service.yaml` y `tasks.md`. Evidencia: `specs/002-alojamientos/validation-report.md`.

## Aislamiento

El servicio **no está registrado** en los workspaces raíz, en `nest-cli.json` ni en `docker-compose.yml`.
Se instala, compila y prueba desde esta carpeta con su propio `package.json` y `package-lock.json`.
`tsconfig.json` extiende `../../tsconfig.base.json` en modo lectura y define solo el alias `@accommodations/*`.

```bash
cd apps/accommodations-service
npm ci
npm run prisma:generate
npm run typecheck && npm run lint && npm run build
npm test                    # unit + integration + contract + security
npm run test:coverage       # umbral global 70 %
npm run openapi:check       # contrato válido y sin drift con el código
```

Las suites `integration` y `contract` necesitan un PostgreSQL 16 desechable con base `accommodations_db`
en `ACCOMMODATIONS_TEST_DATABASE_URL`. Cada suite crea un esquema aislado, aplica las migraciones reales
con `prisma migrate deploy` y lo elimina al terminar. Ejemplo con Docker:

```bash
docker run -d --name stayhub-accommodations-test-db -e POSTGRES_DB=accommodations_db \
  -e POSTGRES_USER=accommodations -e POSTGRES_PASSWORD=TEST_ONLY -p 127.0.0.1:55436:5432 postgres:16-alpine
export ACCOMMODATIONS_TEST_DATABASE_URL=postgresql://accommodations:TEST_ONLY@127.0.0.1:55436/accommodations_db
```

En Windows con Docker Desktop usa `127.0.0.1`, no `localhost`.

## Configuración

Ver `.env.example`. Toda variable admite la variante `_FILE` para leer el valor desde un secreto.
La configuración falla al iniciar si falta o es inválida:

| Variable | Regla |
|---|---|
| `ACCOMMODATIONS_PORT` | Debe ser `3003`. |
| `ACCOMMODATIONS_DATABASE_URL` | `postgres(ql)://` con usuario, contraseña y base exacta `accommodations_db`. |
| `ACCOMMODATIONS_JWT_ISSUER`, `_AUDIENCE`, `_KID` | Obligatorios; deben coincidir con el access JWT de Auth. |
| `ACCOMMODATIONS_JWT_PUBLIC_KEY` **o** `ACCOMMODATIONS_JWT_JWKS` | Exactamente uno. PEM RSA pública ≥ 2048 bits, o JWKS local que contenga el `kid`. Se rechazan claves privadas. |
| `ACCOMMODATIONS_PHOTO_STORAGE_ROOT` | Ruta absoluta del volumen de fotos detrás de `StoragePort`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL `http(s)` del Collector; stdout conserva JSON seguro si no responde. |

La forma en que Auth entregará la clave pública real (PEM o JWKS) está pendiente de G3 (ACC-003).
Las pruebas usan claves RSA sintéticas generadas en memoria.

## Health

`GET /health/live` no depende de la base. `GET /health/ready` exige PostgreSQL accesible y todas las
migraciones versionadas aplicadas; en otro caso responde `503` con Problem Details.

## Imagen

`infra/docker/accommodations/Dockerfile` (contexto: raíz del repo) construye una imagen multi-stage
Node 20 que corre como usuario `node`, expone `3003` y declara el volumen
`/var/lib/stayhub/accommodations/photos`. El target `migration` aplica `prisma migrate deploy`
sobre `accommodations_db`. El servicio, la base, la red interna y el volumen en `docker-compose.yml`
quedan pendientes (archivo compartido, ver `validation-report.md`).
