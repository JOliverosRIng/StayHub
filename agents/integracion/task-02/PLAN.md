# Task 02 — JWT y configuración persistente compartida

Estado inicial: PENDIENTE.
Origen: Fase B y C2 del plan de integración.
Dependencia: task-01 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-02/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Modificar `.env.example` y `scripts/generate-auth-dev-env.mjs` para producir la configuración coherente de ambos servicios. Si hace falta, extraer un helper reutilizable que consumirán ambos modos de arranque. Definir en el resultado sus rutas, API, variables y tratamiento de archivos existentes. No modificar todavía el arranque de procesos o Compose. Verificar B2 con pruebas dirigidas usando emisor real y receptor Users; el recorrido login real→perfil se acredita en task-06. Distinguir expresamente ambas evidencias.

## 6. Fase B — Configuración de confianza entre servicios

Mantener dos pares RSA diferentes: access JWT de usuario y JWT Auth→Users.
Mantener separado también el par del llamador de pruebas que representa Gateway→Auth.
Users recibe únicamente las claves públicas de Auth.

### B1. Correspondencia obligatoria

| Configuración Users | Fuente exacta en Auth |
|---|---|
| `USERS_JWT_PUBLIC_KEY` o su archivo | Clave pública correspondiente a `AUTH_JWT_PRIVATE_KEY` |
| `USERS_JWT_KID` | `AUTH_JWT_ACTIVE_KID` |
| `USERS_JWT_ISSUER` | `AUTH_JWT_ISSUER` |
| `USERS_JWT_AUDIENCE` | `AUTH_JWT_AUDIENCE` |
| `USERS_SERVICE_JWT_PUBLIC_KEY` o su archivo | Clave pública correspondiente a `AUTH_OUTBOUND_SERVICE_PRIVATE_KEY` |
| `USERS_SERVICE_JWT_KID` | `AUTH_OUTBOUND_SERVICE_KID` |
| `USERS_SERVICE_JWT_ISSUER` | `AUTH_OUTBOUND_SERVICE_ISSUER` |
| `USERS_SERVICE_JWT_AUDIENCE` | `AUTH_OUTBOUND_SERVICE_AUDIENCE` |

Usar los siguientes valores coherentes en los ejemplos y en el generador de desarrollo:

```text
AUTH_JWT_ACTIVE_KID=stayhub-auth-2026-01
AUTH_JWT_ISSUER=https://auth.stayhub.internal
AUTH_JWT_AUDIENCE=stayhub-api
AUTH_OUTBOUND_SERVICE_KID=auth-users-2026-01
AUTH_OUTBOUND_SERVICE_ISSUER=stayhub-auth-service
AUTH_OUTBOUND_SERVICE_AUDIENCE=stayhub-users-service
AUTH_OUTBOUND_SERVICE_SCOPE=users:registration users:login-identity
AUTH_OUTBOUND_SERVICE_TTL_SECONDS=60
USERS_REGISTRATION_SCOPE=users:registration
USERS_LOOKUP_SCOPE=users:login-identity
```

Para este incremento el token de Auth lleva ambos permisos, separados por un espacio.
El guard de Users ya valida pertenencia en esa lista. No unificar los dos scopes de
Users ni sustituirlos por `users:identity`; no añadir selección de scope por petición.
Los fixtures de pruebas conjuntas deben usar esta configuración. Los fixtures
aislados pueden mantener valores propios coherentes con sus respectivos dobles.

En Compose: `USERS_SERVICE_URL=http://users-service:3002`.
En modo nativo: `USERS_SERVICE_URL=http://127.0.0.1:3002`.

### B2. Verificaciones

- Token emitido por `UsersServiceTokenProvider` real autoriza GET/create/activate/cancel
  y lookup en Users real.
- Access token devuelto por login real de Auth permite obtener el perfil propio en Users.
- El JWT de servicio no sirve como JWT de perfil; el access JWT no sirve para registro interno.
- Clave, kid, issuer o audience incorrectos son rechazados por Users.
- No copiar la clave privada de Auth a variables, archivos montados o configuración de Users.
- Conservar validación local del JWT, ownership y restricciones del perfil.

### C2. Gestión de secretos y datos

- Generar una configuración local coherente para ambos servicios, con PEM y secretos
  fuera del control de versiones y permisos restrictivos.
- El generador no debe sobrescribir silenciosamente `.env` ni claves existentes.
  Si ya existen, validarlas/reutilizarlas o indicar el conflicto concreto sin exponer valores.
- Conservar claves y secretos HMAC entre reinicios del mismo entorno de desarrollo.
  Regenerarlos automáticamente invalidaría tokens y podría romper reintentos de registro.
- Generar los archivos que Compose requiere: contraseña de Users, URL de Users,
  clave pública access y clave pública Auth→Users.
- No reutilizar por accidente una misma base para Auth y Users.
- Parar el entorno de desarrollo conserva sus volúmenes. Retirar el `down -v`
  automático de ese flujo; reservar destrucción de datos para entornos de prueba
  desechables creados por el harness.

## Criterio de cierre de esta tarea

Ejemplos alineados, configuración generada coherente, claves privadas ausentes de Users y segunda ejecución sin sobrescritura ni rotación de secretos. Pruebas dirigidas de confianza y permisos verdes. B2 login→perfil queda pendiente de task-06, no bloquea esta entrega.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-02 del índice. Dejar el contexto necesario para task-03, sin ejecutarla.
