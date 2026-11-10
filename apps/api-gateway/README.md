# API Gateway — StayHub

Unico punto de entrada publico del Sprint 1. Sirve HTTPS en el puerto **8080** con prefijo
`/api/v1` y no expone ningun otro puerto. No posee dominio de negocio: no almacena datos, no
hashea contrasenas, no emite tokens y no modifica perfiles.

## Alcance

- Termina TLS y enruta las operaciones de identidad hacia `auth-service`/`users-service` y las
  tres operaciones de reseñas hacia `reviews-service`.
- Elimina toda cabecera de identidad, forwarding o service-auth aportada por el cliente antes
  de rutear. Solo propaga el bearer validado, el `traceId` y las cabeceras de la allowlist.
- Valida el access JWT (RS256) e introspecta `sid` en Auth. Si Auth no responde, falla cerrado
  con `503`.
- Aplica los limites antiabuso de borde en su Redis propio: 10 registros por origen cada
  10 minutos y 30 intentos de login por origen cada 5 minutos. Redis caido produce `503`.
- Mapea los errores de Auth, Users y Reviews a Problem Details sin convertir un error remoto en exito.

## Integración con Reviews (Sprint 3)

| Ruta pública | Destino interno | Credencial saliente |
|---|---|---|
| `POST /api/v1/reviews` | `POST /internal/v1/reviews` | bearer del usuario validado (`GUEST`) |
| `GET /api/v1/properties/:propertyId/reviews` | `GET /internal/v1/properties/:propertyId/reviews` | JWT de servicio, audience Reviews y scope `reviews:read` |
| `GET /api/v1/reviews/user/:userId` | `GET /internal/v1/reviews/user/:userId` | bearer del usuario validado, con ownership previo en Gateway |

El Gateway no crea ni consulta reseñas directamente. Solo valida borde, enruta, propaga
`x-request-id` hacia Reviews y conserva respuestas/errores contractuales.

Estructura de capas (Constitucion II). El Gateway **no tiene `domain/`** porque no posee
dominio de negocio:

```
src/
├── application/      casos de uso y puertos
├── infrastructure/   config, cache, http, observability, security
├── interfaces/       http, openapi
└── modules/          composicion NestJS
```

Los alias por capa son `@gateway/application/*`, `@gateway/infrastructure/*`,
`@gateway/interfaces/*` y `@gateway/modules/*`, definidos en `tsconfig.base.json`.

## Comandos

Desde la raiz del repositorio:

```powershell
npm run build:gateway
npm run lint:gateway
npm run typecheck:gateway
npm run test:gateway -- --coverage
```

Suites por separado: `test:unit`, `test:integration`, `test:contract`, `test:e2e`,
`test:performance` y `test:security`. El umbral de cobertura de las cuatro metricas es 70%
sobre `src/**` (excluye `main.ts`).

## Configuracion

Todas las variables usan el prefijo `GATEWAY_` y estan documentadas en `.env.example`.
La aplicacion **falla al arrancar** si falta cualquiera de las obligatorias. Los secretos se
referencian por ruta mediante `*_FILE`; nunca se versionan secretos ni certificados.

Puntos que no son negociables:

- `GATEWAY_PORT=8080` y `GATEWAY_API_PREFIX=/api/v1`. No existe listener HTTP publico alternativo.
- `GATEWAY_MAX_PHOTO_BYTES=5000000`: **5 MB decimales**, no 5 MiB (5242880).
- El origen de red se toma del socket. Una cabecera `X-Forwarded-For` solo se acepta si el
  proxy inmediato esta en `GATEWAY_TRUSTED_PROXY_CIDRS`.
- Las credenciales de service JWT son distintas de las del JWT de usuario, con issuer,
  audience y scope propios por destino.

## Red y secretos en Compose

| Red | Uso |
|---|---|
| `stayhub-internal` | auth-db, auth-redis, auth-migrate, auth-service, gateway-redis, api-gateway |
| `services` | comunicación del Gateway con Users y Reviews; no publica los microservicios |

`gateway-redis` es una instancia separada de `auth-redis`, con credenciales y namespace
propios (`GATEWAY_REDIS_NAMESPACE`). El healthcheck lee la contrasena desde su fichero de
secretos para no exponerla en los argumentos del proceso.

`api-gateway` declara `restart: unless-stopped`; `auth-service` conserva su política propia.

## Fuera de alcance

Sin `domain/`, sin RabbitMQ, sin logica de alojamientos, busquedas, reservas, pagos,
recuperacion de contrasena, verificacion de correo, MFA ni aprovisionamiento de `ADMIN`.
