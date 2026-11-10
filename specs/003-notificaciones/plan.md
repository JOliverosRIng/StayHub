# Plan de implementación: notifications-service

**Rama**: `feat/notifications-service` | **Fecha**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Especificación [`spec.md`](spec.md), decisión aprobada de Fase 1 y hallazgos del repo.

## Resumen

Implementar un servicio NestJS/TypeScript que autentica llamadas de envío y lectura con validación local JWT, genera tres clases de notificación, persiste de forma idempotente en una base propia PostgreSQL/Prisma y expone solo las dos rutas del contrato. Un puerto de entrega separa `IN_APP` de un adaptador `EMAIL` local falso. La consulta aplica ownership y cursor estable. Se documenta y valida el contrato OpenAPI sin tocar raíz, Compose, Gateway u otros servicios.

## Contexto técnico

**Lenguaje/versión**: TypeScript estricto, Node 20 (alineado a Users).  
**Dependencias principales**: NestJS 10, Prisma 6, PostgreSQL, class-validator/transformer, Passport/JWT RS256, Jest, Swagger y Swagger Parser; versiones copiadas de `apps/users-service` donde correspondan.  
**Persistencia**: PostgreSQL propio, base `notifications_db`; acceso solo desde repositorio Prisma tras puerto de aplicación.  
**Pruebas**: Jest en suites `unit`, `integration`, `contract`, `security`; suites de contrato OpenAPI validadas localmente.  
**Plataforma**: servicio HTTP en puerto interno `3009`; arranque sin llamadas a otros servicios.  
**Tipo de proyecto**: microservicio backend NestJS.  
**Metas de rendimiento**: no hay SLO cuantitativo en tendencias; límites de respuesta acotados mediante paginación 20/100.  
**Restricciones**: no modificar fuera de `apps/notifications-service` y `specs/003-notificaciones`; sin proveedor externo, colas, scheduler, retry, secrets reales, log de contenido, push o merge. El test de integración de persistencia puede usar solo PostgreSQL de prueba propio.  
**Alcance**: dos endpoints, tres tipos, dos canales, persistencia propia, JWT local, cursor y suites automatizadas.

## Comprobación de constitución

- **I Dominio**: envío y lectura de notificaciones son responsabilidad propia; las referencias a `userId`/`bookingId` no crean FK cruzada.
- **II Capas**: dominio/aplicación no importan NestJS/Prisma; repositorios y delivery son adaptadores de puertos.
- **III Datos**: DB separada y servicio dueño del esquema.
- **IV Comunicación**: solo HTTP síncrono documentado; no se agregan eventos sin alcance aprobado.
- **V Seguridad**: auth local RS256, scopes/roles mínimos, ownership y DTOs cerrados; casos adversariales nombrados en las tareas.
- **VI Código**: TypeScript estricto y módulos cohesivos.
- **VII Contrato**: OpenAPI versionado y comparación/validación local.
- **VIII Verificación**: cada NTF trae test nombrado, criterios, lint/typecheck/test y commit propio.
- **Gate inicial**: PASS con límite explícito de archivos. La constitución también exige Compose reproducible e integración Gateway, pero su modificación está prohibida por el alcance explícito. Se documenta como integración de plataforma posterior, sin falsa declaración de despliegue compuesto completo.
- **Gate de diseño**: PASS sujeto a las dependencias externas ya identificadas: provisionar variable/key de service JWT y base propia fuera del alcance de archivos compartidos.

## Alineación con users-service

**Se replica**: `src/domain`, `application/ports` y casos de uso, adaptadores de infraestructura, módulos Nest de composición, guard/roles, DTO cerrado, Problem Details/trace, config obligatoria con `_FILE`, JWT RS256 con allowlist y `kid`/issuer/audience/tiempos, Prisma/PostgreSQL, logger seguro, Swagger, pruebas Jest en cuatro categorías y scripts `test:*`, `lint`, `typecheck`.

**Desviaciones**:

1. No habrá `UsersService`, cliente HTTP a Users ni foreign key de user; `userId` es referencia UUID externa, porque el servicio no debe llamar otros servicios.
2. No se replica registro/login/perfil, sesiones, foto, scopes de Users ni acceso a las bases de Users.
3. La ruta de send permite access JWT `ADMIN` además de service JWT de scope dedicado; lectura usa owner/admin. Son reglas aprobadas para notifications.
4. Email es un adaptador falso sin red y `IN_APP` es persistencia; no se copia ninguna integración externa.
5. Cursor compuesto reemplaza la paginación no existente en Users; responde a la decisión aprobada.
6. La base será `notifications_db`; Compose no puede configurarla en esta tarea debido a la prohibición de cambios compartidos.
7. El validador OpenAPI será local al servicio (`apps/notifications-service/scripts/validate-openapi.mjs`) usando Swagger Parser, en vez de modificar `scripts/validate-users-openapi.mjs` o scripts raíz.

## Diseño por capa

- **Dominio**: enum/tipos de notificación, estado/canal, política de plantillas y validación semántica, política idempotente, entidad y errores de dominio.
- **Aplicación**: `SendNotification`, `ListUserNotifications`, puertos `NotificationRepository`, `DeliveryPort`, reloj/ID si hacen falta; usa casos de uso sin dependencia Nest.
- **Interfaces HTTP**: controlador de las dos rutas, DTOs discriminados, access/service JWT guards, roles/ownership, conversión de query y Problem Details compatible.
- **Infraestructura**: configuración del servicio/llaves, Prisma schema/migrations, repositorio idempotente y cursor, adaptador local email, no-op IN_APP, logger redactado y salud/readiness local.
- **Módulos**: `NotificationsAuthModule`, `NotificationsModule`, `ConfigModule` y `PrismaModule` ensamblados por `AppModule`. No se agrega ruta de health al contrato v1, que queda limitado a las dos rutas acordadas.
- **OpenAPI**: documento generado/contrastado con YAML versionado; el validador local compila el contrato en proceso o valida YAML independiente, sin editar raíz.

## Estructura propuesta

```text
apps/notifications-service/
├── package.json, package-lock.json, tsconfig*.json, jest.config.ts, eslint.config.mjs, README.md, .env.example
├── prisma/schema.prisma, prisma/migrations/**
├── scripts/validate-openapi.mjs
├── src/
│   ├── app.module.ts, main.ts
│   ├── domain/{notifications,shared}/
│   ├── application/{ports,notifications}/
│   ├── infrastructure/{config,logging,persistence/prisma,security,delivery}/
│   ├── interfaces/{http/{auth,guards,notifications},openapi}/
│   └── modules/{health,notifications-auth,notifications}/
└── test/{unit,integration,contract,security,fixtures}/

specs/003-notificaciones/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── contracts/openapi-notifications-service.yaml
└── checklists/requirements.md
```

## Puertas de calidad

Por cada tarea NTF, ejecutar desde `apps/notifications-service`: `npm test -- --runInBand`, `npm run lint`, `npm run typecheck`. Integration con PostgreSQL usa `NOTIFICATIONS_TEST_DATABASE_URL` local de prueba; ninguna suite conecta a servicios/proveedores externos. Cada tarea termina en commit `feat(notifications): NTF-### <descripción corta>`. La evidencia final adicional ejecuta suites separadas y validador OpenAPI. No se hace commit ahora.

## Seguimiento de implementación

La ejecución está serializada por acuerdo de usuario: implementar exactamente una NTF por ciclo, detenerse al terminarla y esperar la siguiente instrucción. Setup y persistencia propia son prerequisitos; luego auth, send/idempotencia y read/ownership; la última NTF reúne evidencias. La etapa Compose/Gateway no se incluye como código ni como una afirmación de terminado.

