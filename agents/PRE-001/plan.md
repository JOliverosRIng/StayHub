# PRE-001 — Preparar ejecución, composición y harness reutilizable

Estado inicial: pendiente. Tipo: Preparación local.

## Resultado esperado y evidencia

Hay scripts, cuatro suites unitarias y preparación PostgreSQL/Redis. No hay harness HTTP/criptográfico. El build usa rootDir ../.. y aliases con webpack:false; no se verificó que el CMD encuentre el JS. AppModule no exporta providers hacia módulos futuros.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D08, D09, D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: ninguna; puede comenzar con la revisión actual.

## Archivos concretos

- `apps/auth-service/src/main.ts`
- `apps/auth-service/src/app.module.ts`
- `apps/auth-service/src/interfaces/http/configure-auth-http.ts (nuevo)`
- `apps/auth-service/src/interfaces/http/trace.interceptor.ts`
- `apps/auth-service/src/modules/core/core.module.ts (nuevo)`
- `apps/auth-service/src/modules/service-auth/service-auth.module.ts (nuevo)`
- `apps/auth-service/test/helpers/{auth-app,crypto-fixture,fake-clock,users-stub}.ts (nuevos)`
- `apps/auth-service/test/integration/dependencies.setup.ts`
- `apps/auth-service/jest.config.ts`
- `apps/auth-service/package.json`
- `package-lock.json`
- `nest-cli.json`
- `apps/auth-service/tsconfig.build.json`
- `infra/docker/auth/Dockerfile`
- `infra/docker/auth/compose.test.yml (nuevo)`

## Pasos de ejecución

Antes de estos pasos: comprobar el diff y un posible resultado previo. Durante la planificación apareció trabajo concurrente en varios archivos de este plan; reutilizarlo y verificarlo, sin reemplazarlo automáticamente.

1. Usar Node 20; ejecutar npm ci, prisma:generate y las cuatro suites existentes. Registrar resultado real. Si faltan Docker o permisos, preparar archivos y registrar qué prueba no pudo ejecutarse.
2. Verificar npm run build desde raíz y workspace; inspeccionar ruta emitida y ejecutar node sobre el entrypoint con configuración sintética. Si quedan imports @auth sin resolver, elegir bundling Nest webpack:true con Prisma/argon2 como externos; fijar salida dist/apps/auth-service/main.js y CMD Docker dist/main.js, probando ambas. No parchear a ciegas el path.
3. Extraer configureAuthHttp(app): middleware asigna/valida x-trace-id antes de guards, pipe y filtro productivos; main y auth-app de test lo usan. Mantener TraceInterceptor compatible sin generar un segundo ID.
4. Crear CoreModule que exporta CLOCK, UUID_GENERATOR, ENTROPY_GENERATOR basado en randomBytes, config y logger. Crear ServiceAuthModule que importa CoreModule y exporta verifier, guard, UsersServiceTokenProvider y UsersServiceClient. Adaptar AppModule sin cambiar los cuatro casos de uso aún inexistentes.
5. Crear crypto-fixture con tres pares RSA efímeros, config completa y factory de service JWT; FakeClock con now/advance; factory HTTP que acepta overrides explícitos. Users stub usa servidor HTTP en puerto efímero y estado en memoria, con inyección de timeout antes/después de mutación.
6. Crear compose.test.yml con PostgreSQL 16/Redis 7 aislados, credenciales sintéticas y puertos ligados a 127.0.0.1 con valores configurables. Documentar comando docker compose -f infra/docker/auth/compose.test.yml -p stayhub-auth-test up -d y variables TEST_AUTH_*.
7. Antes de borrar datos comprobar database termina en _test y Redis DB=15 en harness; exigir opt-in AUTH_TEST_ALLOW_CLEANUP=true. Nunca tomar AUTH_DATABASE_URL productiva como fallback. Restaurar entorno al cerrar y cerrar servidores/timers/clientes aunque falle una prueba.
8. Separar selección cross-service del Jest local por patrones explícitos de los archivos AUTH-076–081/082; añadir script test:cross-service que falla con mensaje claro si faltan dependencias. No ocultar ausencia de suites locales con --passWithNoTests.

## Criterios de aceptación

- [ ] Los tests existentes se ejecutan con dependencias instaladas; ningún test nuevo necesita claves versionadas.
- [ ] Un test de health y otro de rechazo previo al controlador comprueban traceId coherente usando configureAuthHttp.
- [ ] La invocación de limpieza sobre URL no test se rechaza antes de ejecutar SQL/FLUSHDB.
- [ ] Build y entrypoint probados o limitación de entorno reportada; no declarar runtime verificado sin arrancarlo.

## Comprobación

```sh
npm run prisma:generate
npm run typecheck
npm run test:unit
npm run build
npm run lint
```

No implementar login, registro ni modelos de otros servicios. Añadir solo helpers realmente usados por los planes.

Al terminar, crear `agents/PRE-001/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
