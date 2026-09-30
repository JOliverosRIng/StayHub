# AUTH-082 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service` (trabajo sin commitear).
Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-074 (verificada localmente). Reglas aplicadas: D01, D08, D09.
Auditoría: H14 (riesgo de aliases/arranque de la imagen) y H15 (readiness por `count>=2`).

## Objetivo

Verificar de forma real la imagen multi-stage y el arranque en contenedor: usuario no root, puerto 3001
interno sin publicación, dependencia nativa (`argon2`/Prisma con OpenSSL), migraciones `001–004` antes de
`ready`, detección de esquema incompleto, `live` independiente de dependencias, reinicio sin pérdida de
datos, OTLP ausente sin bloquear `ready` y limpieza estricta de los recursos de prueba.

## Entorno

- **Docker no instalado.** Se usó **Podman 5.8.7** (rootless, overlay) y **podman-compose 1.6.0**, como
  autoriza el plan. El harness detecta `docker` o `podman`; CI usa Docker.
- `PrismaService.hasAppliedMigrations` ya exigía los nombres concretos `001–004` y rechazaba migraciones
  sin terminar (H15 resuelto en PRE-002/003): no requirió cambios.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `infra/docker/auth/Dockerfile` | `openssl` y `ca-certificates` en las etapas `dependencies` y `runtime`. | Prisma advertía por libssl ausente en runtime; el engine debe detectar OpenSSL. |
| `test/helpers/compose-harness.ts` (nuevo) | Detección de engine, generación de claves/secretos efímeros, `compose up/down`, build, `exec`, health, `psql`, stop/start/restart y limpieza. | Encapsular el harness reutilizable sin tocar ambientes compartidos. |
| `test/integration/auth-compose.spec.ts` (nuevo, 7 tests) | Verificación estática del compose y ejecución real del stack. | Evidencia de los criterios del plan. |
| `test/cross-service/setup.ts` | Deja de exigir G1/G2 globalmente; solo fija timeout. | El harness de compose no usa proveedores externos. |
| `test/helpers/cross-service-providers.ts` (nuevo) | `requireCrossServiceProviders()` para que AUTH-076–081 fallen explícitamente sin G1/G2. | Preserva D09 sin bloquear el harness de compose. |
| `.github/workflows/ci.yml` | Paso `test:cross-service ... auth-compose.spec.ts` tras el `docker build`. | Ejecutar imagen y compose donde Docker está disponible. |
| `apps/auth-service/README.md` | Sección de contenedores e integración. | Documentar comandos y alcance. |

El compose raíz (`docker-compose.yml`) no se modificó: ya usaba redes internas, sin `ports`, `restart: always`
y `depends_on` por `service_healthy`/`service_completed_successfully`.

## Comportamiento verificado

- La imagen corre `node dist/main.js` como `stayhub` (UID 999, no root), carga `argon2` nativo y Prisma, y
  contiene `dist/main.js`.
- El stack arranca tras `auth-migrate` (exit 0) sobre volumen vacío; `ready` → 200 y `live` → 200; **ningún**
  puerto de `auth-db`, `auth-redis` ni `auth-service` se publica al host.
- Marcar `004_session_revocation` como `rolled_back_at` provoca `ready` 503 con `live` 200 (no hay falso
  positivo por `count>=2`); restaurar vuelve a 200.
- Con Redis detenido: `live` 200 y `ready` 503; al rearrancar: `ready` 200.
- Reiniciar el servicio conserva los datos migrados (mismo conteo en `_prisma_migrations`).
- Con OTLP en `127.0.0.1:4318` inalcanzable, `ready` permanece 200 y la sonda de red confirma
  `unreachable`.
- `afterAll` elimina contenedores, red, volumen, imágenes del proyecto y el directorio temporal. Verificado
  sin residuos tras dos ejecuciones.

## Evidencia de comandos

```sh
npm run build            # OK
npm run typecheck        # OK
npm run lint             # OK
npm run openapi:check    # 1 suite, 11 tests
npm run test:unit        # 17 suites, 140 tests
npm run test:contract    # 7 suites, 142 tests
npm run test:security    # 3 suites, 59 tests
npm run test:cross-service --workspace @stayhub/auth-service -- --runTestsByPath test/integration/auth-compose.spec.ts
# Podman 5.8.7 + podman-compose 1.6.0: 1 suite, 7 tests, 0 fallos (~5–7 min)
```

## Criterios de aceptación

- [x] La imagen arranca realmente; no basta con que el build termine.
- [x] La migración precede al tráfico y `ready` detecta el esquema incompleto.
- [x] No hay secretos versionados ni servicios internos publicados.
- [x] Limpieza únicamente de recursos del proyecto de prueba, con nombre único.

## Pendiente / handoff

- **AUTH-076–081:** preparar suites cross-service y registrar BLOQUEADO EXTERNO (G1/G2).
- **AUTH-084:** informe de cierre parcial.
- Sin bloqueos de infraestructura: la verificación se ejecutó con Podman; CI la ejecuta con Docker.
