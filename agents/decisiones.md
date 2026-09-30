# Decisiones de implementación para ejecutar los planes

Estas decisiones son propuestas concretas derivadas de spec/plan/modelo y del código revisado. No son código implementado ni acuerdos ya aceptados por G1/G2. Las decisiones locales pueden ejecutarse; las fronteras externas se validan con sus responsables en PRE-004.

Cada plan indica los apartados que debe leer. Rutas de código relativas a la raíz del repositorio. No se requiere leer todo el proyecto para una tarea.

## D01 — Alcance, reglas y entrega

- Trabajar solo en Auth y sus artefactos. No implementar Users ni Gateway.
- Reutilizar las entidades y adaptadores existentes; completar los métodos necesarios. Dominio/aplicación sin Nest, Prisma, HTTP ni Redis. Usar factories Nest en módulos para inyectar casos de uso.
- No modificar las migraciones 001/002 aplicables a otras instalaciones. Añadir 003 para registro y 004 para sesiones en ese orden.
- Cada ejecutor entrega archivos cambiados, comandos y resultados, casos que faltan y bloqueos externos. Solo marcar una tarea original cuando pase su criterio completo.
- Un modelo recibe un plan a la vez. Ejecutar el orden de README; no lanzar agentes ni tareas paralelas automáticamente.
- Las pruebas se preparan antes del comportamiento. Una tarea de pruebas puede quedar en estado RED esperado; la historia no está cerrada hasta GREEN. Un fallo de importación, credencial de entorno o conexión no es evidencia RED de negocio.

## D02 — Contratos HTTP y errores

Auth conserva estas rutas internas, todas con Authorization: Bearer <service JWT>:
POST /internal/v1/registrations, POST /internal/v1/login,
POST /internal/v1/sessions/refresh y POST /internal/v1/sessions/validate.
Health permanece sin bearer. No poner cookie ni JWT de usuario en Authorization de estos endpoints.

Registro: body name/email/password/role, Idempotency-Key UUID; 201 {id,name,email,role}.
Login y refresh: 200 {accessToken,refreshToken,expiresIn:3600,absoluteExpiresAt,principal:{userId,sessionId,role}}.
Validación: body {sessionId,userId}; 200 {active:true,role}, 401 si no hay sesión válida o pertenece a otro usuario.
El Gateway valida el JWT de usuario antes de invocar introspección; no añadir un rol a su request de validación.

400 para forma inválida/campos desconocidos; 401 para service JWT inválido o credenciales/token/sesión no válidos; 403 para guard de roles de usuario en una ruta de prueba; 409 para conflicto de registro; 429 con Retry-After entero >=1; 503 para dependencia autoritativa no disponible.
Un fallo Users 401/403 es configuración interna y se traduce a 503, no a “contraseña incorrecta”.
Problem Details incluye type,title,status,detail,instance,code,traceId y errors opcional; errors seguirá siendo string[] por compatibilidad con el mapper actual.
No registrar request body, bearer, cookies, credenciales ni respuesta interna con tokens.
Los tokens son deliberadamente parte de login/refresh exitosos; name/email son deliberadamente parte del resumen de registro. Pruebas de secretos deben respetar esas excepciones.

## D03 — Registro durable sin persistir datos personales

RegisterAccountUseCase.execute({idempotencyKey,input,traceId}) retorna el resumen público.
Validar/normalizar name con trim, email con trim+lowercase para unicidad/fingerprint; password se mantiene exacta, contando puntos de código Unicode (8–128).
Para salida conservar email recortado si lo devuelve Users; nunca fabricar información desde auth_db.

La misma key y fingerprint conserva userId. Key distinta con correo duplicado: 409 desde Users.
Misma key con distinto fingerprint: 409 antes de modificar credencial o llamar Users.
COMPLETED repetido consulta Users por registrationId para devolver el resumen vigente; si Users falla, 503. No guardar una copia del perfil como respuesta cacheada.
CANCELLED repetido: 409 REGISTRATION_CANCELLED, nueva operación requiere otra key.

Reclamar registro con lease (PRE-002) antes de pasos externos. Persistir cada avance en transacción local breve; ninguna llamada HTTP dentro de una transacción PostgreSQL.
Orden: STARTED → crear/consultar User PENDING → USER_PENDING → guardar hash Credential PENDING → CREDENTIAL_PENDING → activar Credential → CREDENTIAL_ACTIVE → activar User → verificar ambos ACTIVE → COMPLETED.
Una credencial ACTIVE con User PENDING sigue sin ser autenticable: login exige ambos ACTIVE.
Activación de credencial y transición correspondiente usan la misma transacción de Auth.
Antes de cualquier compensación, consultar estado autoritativo Users. Ambos ACTIVE significa COMPLETED incluso si el TTL local venció; nunca cancelar esa identidad.

Recuperación sin request original:
- STARTED/User ausente: no se puede reconstruir nombre/correo/contraseña. Esperar reintento del cliente hasta TTL; después cancelar sin inventar payload.
- User PENDING y credencial ausente: falta contraseña. Esperar reintento/TTL; después compensar.
- User PENDING y credencial PENDING/ACTIVE: puede continuar sin contraseña cruda.
- User ACTIVE y credencial ACTIVE: completar.
- User CANCELLED: revocar credencial local y cancelar.
- User ACTIVE con credencial ausente/REVOKED: inconsistencia; registrar código seguro y mantener pendiente de intervención/reconciliación. No eliminar usuario expuesto ni afirmar éxito.
- Users no disponible: conservar estado y reintentar; 404 confirmado es diferente de timeout.

Reconciliación cada 30s, TTL 900s, lote 50, máximo 5 intentos de avance fallidos. Backoff elegido: min(30*2^(n-1),300) segundos para fallo n>=1. No incrementar contador por una fila aún no elegible.
Tras agotar intentos/TTL, COMPENSATING se reintenta indefinidamente hasta confirmar cancelación; la caída de Users no se resuelve inventando CANCELLED.
En compensación pedir cancelación Users antes de revocar Credential ACTIVE. Si Users dice 409/ACTIVE, consultar: puede haberse activado antes de un timeout. Completar si ambos ACTIVE.

## D04 — Transacciones de sesión y rotación

Definir SessionUnitOfWork (PRE-003) sin Prisma en su interfaz.
execute(work) proporciona repositorios atados al mismo cliente transaccional; los callbacks no llaman repositorios raíz.
Para login: insertar Session + primer RefreshToken en una transacción.
Para refresh: lookup por hash para obtener sessionId; dentro de transacción bloquear Session primero y RefreshToken después, releer ambos y decidir. Orden de locks idéntico en revocación.
Token desconocido/revocado/vencido o sesión no activa: 401 sin nuevo token.
Token CONSUMED de una sesión aún activa: fijar revokedAt y revokeReason=REFRESH_REUSE, revocar todos los refresh ACTIVE y COMMIT. Devolver un resultado discriminado; lanzar el error 401 fuera de la transacción para no deshacer la revocación.
Rotación válida: actualizar token viejo a CONSUMED con consumedAt y sucesor temporalmente null; insertar reemplazo ACTIVE; completar replacedByTokenId; incrementar version de sesión sin cambiar rol o expiry. Este orden respeta el índice parcial y la FK inmediata del sucesor.
Preparar/firma de JWT dentro del callback antes del commit, o asegurar rollback si falla. Solo enviar tokens tras commit exitoso.
Serialization/deadlock: retry máximo 3, solo errores PostgreSQL/Prisma de concurrencia identificados; nunca reintentar indiscriminadamente fallos de negocio.
Dos peticiones simultáneas con el mismo refresh: como máximo una rotación; la otra detecta replay y revoca la familia. El token emitido por la primera puede quedar revocado inmediatamente; ese es el comportamiento exigido.

## D05 — Tokens, login y rate limit

IssueSessionTokensService prepara {session,refreshToken,accessToken,rawRefreshToken}; persistencia la coordina el caso de uso/UoW.
Usar 32 bytes aleatorios → base64url como refresh; HMAC-SHA256 hexadecimal de 64 caracteres con AUTH_REFRESH_TOKEN_HMAC_SECRET para persistencia.
AccessTokenClaims de firma conserva sub/sid/role/jti. Añadir VerifiedAccessTokenClaims con iat/exp numéricos para verificación. UUID para sub/sid/jti, role allowlist, RS256/kid/iss/aud/exp obligatorios; verificar duración 3600s.
Sesión: expiry login+604800s; refresh siempre usa ese expiry; access exp=iat+3600 aunque reste menos de una hora de sesión. La introspección rechaza sesión vencida.

LoginUseCase.execute({email,password,traceId}): normalizar email; consultar rate limiter; resolver Users; buscar Credential solo si identidad ACTIVE; verificar hash real para credencial activa o señuelo en las demás ramas; exigir existencia y estados además del boolean de Argon2. El password señuelo nunca permite autenticar una identidad inexistente.
InvalidCredentialsError idéntico para inexistente, password errónea o estados inactivos. No afirmar tiempos idénticos; verificar mismo trabajo Argon2 en ramas negativas.
Crear sesión y limpiar contador de fallos antes de confirmar éxito. Si Redis falla al limpiar, rollback de la creación de sesión; 503.

Añadir AUTH_LOGIN_IDENTIFIER_HMAC_SECRET >=32 caracteres separado del secreto de refresh.
LoginRateLimiter: inspect(emailNormalized) y recordFailure(emailNormalized), clear(emailNormalized), todos sobre HMAC, nunca correo en claves.
Ventana fija 900s desde primer fallo. Fallos 1–5 → 401; sexto fallo → 429; mientras contador >=6, inspect bloquea cualquier intento antes de Users/Argon2. Éxito con contador <=5 limpia. La ventana no se prolonga por intentos adicionales.
Lua atómico devuelve count y TTL; Retry-After=max(1,ceil(PTTL/1000)). Redis caído → DependencyUnavailableError/503, sin autenticar.

## D06 — Introspección, caché y autorización

ValidateSessionUseCase.execute({sessionId,userId,accessTokenExpiresAt?}) devuelve active/role.
Contrato HTTP actual no transporta expiración del access token: para esa ruta no cachear resultados positivos. Consultar PostgreSQL siempre; no inventar una hora restante.
Para callers locales con JWT verificado puede escribir caché con TTL <=min(exp-now,absoluteExpiry-now). Aun así, un hit positivo no evita comprobar PostgreSQL: se prioriza revocación inmediata sin diseñar coherencia distribuida adicional.
Error Redis en caché de sesiones permite fallback PostgreSQL; error DB siempre 503. Stale cache ACTIVE jamás resucita una sesión.
Gateway compara rol de JWT con rol autoritativo recibido; Auth no consulta rol Users durante refresh/validate.

Passport se usa en guard de access JWT para consumidores/rutas de prueba con JWT de usuario; las cuatro rutas internas mantienen service JWT.
Roles guard usa principal validado, nunca headers de identidad, campos body ni claims sin verificar. Autenticación se ejecuta antes de roles; probar 401 y luego 403 con controlador solo de test.

## D07 — Contrato Users propuesto y dependencia externa

Ya existen POST create, POST activate, POST cancel y POST resolve en openapi-users-service.yaml.
Falta GET /internal/v1/registrations/{registrationId}. Propuesta para G2: service JWT, UUID, 200 UserSummary existente {id,name,email,role,status}, 404 ausente, 401/403 autenticación y 503 dependencia. No escribir este endpoint en la aplicación Users desde Auth.
El adapter mapea id→userId y retiene name/email solo en memoria para la respuesta pública.
create/activate deben verificar coincidencia con userId esperado y formato/status antes de avanzar.
Definir RegistrationIdentity={userId,name,email,role,status} en el puerto; LoginIdentity sigue siendo {userId,role,status:'ACTIVE'}.
El stub implementa explícitamente esta propuesta y se rotula “contrato candidato”. Su éxito no acredita integración con Users.
PRE-004 crea el documento de coordinación; AUTH-041 avanza contra el candidato. AUTH-076/079 no se cierran sin aceptación y provider real.
No introducir rutas de administración ni fixtures productivos para preparar estados; usar harness oficial G2.

## D08 — Composición y harness

PRE-001 extrae configureAuthHttp(app) para compartir middleware de traceId previo a guards, ValidationPipe, filtro y configuración real entre main y tests.
Para pruebas de contrato se permite TestModule con controladores reales, guards reales y casos de uso dobles; para integración usar PostgreSQL 16/Redis 7 reales y Users stub HTTP.
CryptoTestFixture genera claves RSA efímeras separadas access/inbound/outbound, service JWT y configuración completa; no commitear PEM privados.
Config de test se inyecta explícitamente; no leer .env productivo. Reloj FakeClock de test controlable.

Credenciales, sesiones y adapters se exportan desde módulos propietarios. Crear CoreModule para CLOCK/UUID/ENTROPY/config/logger y ServiceAuthModule para verifier/guard/provider/cliente; no duplicar providers de estado por módulo.
PRE-001 establece infraestructura/harness; AUTH-046 mueve Credential/Registration a sus módulos; AUTH-072 termina Login/Sessions/Tokens.
Migrations readiness exige los nombres concretos de migraciones esperadas, no count>=2.

## D09 — Verificación y comandos

Desde raíz, con Node 20 y dependencias instaladas:
```sh
npm ci
npm run prisma:generate
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run openapi:check
```
Un solo archivo, cambiar project/file según el plan:
```sh
npm run test --workspace @stayhub/auth-service -- --selectProjects unit --runTestsByPath test/unit/session.spec.ts
```
El script del workspace ya incluye --runInBand. Para integration configurar TEST_AUTH_DATABASE_URL y TEST_AUTH_REDIS_URL de instancias desechables preparadas por PRE-001. No inventar un resultado si faltan.
Cobertura: npm run test:coverage --workspace @stayhub/auth-service.
Separar suite cross-service en script explícito test:cross-service manteniendo carpetas contract/integration; su comando debe fallar claramente si faltan providers. No usar test.skip o --passWithNoTests para acreditar integración.
Las pruebas RED de endpoints pueden registrar 404 como fallo de conducta esperada, con módulo compilable. Importaciones a futuros archivos deben resolverse mediante interfaces/fixtures de prueba, no clases productivas vacías para simular implementación.
Registrar evidencia en agents/<ID>/resultado.md durante la ejecución futura; esta planificación no crea resultados ficticios.

## D10 — OpenAPI y observabilidad

Mantener OpenAPI 3.0.3; estabilizar operationId/schema names en decoradores; si cambian nombres locales, mapear por estructura al comparar sin ignorar required, enum, límites, security ni respuestas.
Agregar 401 a registro y 400 a login/refresh/validate porque los guards/pipes realmente los producen; hacerlo en contrato Auth y Swagger en conjunto. Cambios públicos los revisa G1.
Eliminar writeOnly de accessToken/refreshToken en DTO de respuesta; solo requests/password siguen writeOnly.
El exportador usa app de composición con dependencias de prueba, pero controladores/decoradores productivos. Comparar las cuatro rutas internas y health documentado.
Logger usa eventos permitidos y contexto seguro; errores desconocidos no devuelven Error.message crudo. traceId se establece antes de guards y se conserva en respuesta/cuerpo/log; OTLP y stdout comparten redacción.
