# 6. Fuentes oficiales y control de versiones

[Índice](README.md)

Consulta realizada el 2026-09-28. Los enlaces se usaron para contrastar mecanismos y recomendaciones. Los laboratorios y ejemplos de StayHub son elaboraciones didácticas; no son una certificación de seguridad ni aplicaciones ejecutadas en esta entrega.

## Compatibilidad

| Área | Base de esta guía | Precaución concreta |
|---|---|---|
| StayHub existente | Nest 10, Prisma 6, jose 5 según package.json | Respetar lockfile y revisar cambios concurrentes |
| Node | Consultar líneas LTS soportadas; 22/24 figuran LTS al consultar | engines del repo aún exige Node 20; actualizarlo es otro cambio |
| Spring didáctico | Java 21, Boot 3.5, Framework 6.2, Security 6.5 | No mezclar APIs javax antiguas ni versiones sueltas de Security |
| PostgreSQL | 16 para experimentos | H2/mocks no reproducen toda su concurrencia |
| Redis | 7 para laboratorio StayHub | El reloj Redis es distinto de tu FakeClock |
| Keycloak | 26.7.4 en el quickstart consultado | Configuración de desarrollo y producción difieren |

Los números anteriores sitúan los ejemplos, no recomiendan congelar software indefinidamente. Documenta la versión exacta que ejecutas y lee la documentación de esa familia.

## Leer por pregunta

| Pregunta | Fuente primaria | Qué buscar |
|---|---|---|
| ¿Qué puede inyectar Nest? | [Custom providers](https://docs.nestjs.com/fundamentals/custom-providers) | Tokens, factories, aliases y exports |
| ¿En qué orden ocurre HTTP? | [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle) | Guards antes de pipes/interceptors de entrada |
| ¿Cómo rechazar campos extra? | [Validation](https://docs.nestjs.com/techniques/validation) | whitelist, forbidNonWhitelisted y transform |
| ¿Cómo encaja autenticación? | [Authentication](https://docs.nestjs.com/security/authentication) | Guard, principal y emisión básica |
| ¿Cómo aislar dependencias? | [Testing Nest](https://docs.nestjs.com/fundamentals/testing) | TestingModule y overrides |
| ¿Qué confirma Prisma junto? | [Transactions](https://www.prisma.io/docs/orm/fundamentals/transactions) | Contexto transaccional y límites |
| ¿Qué bloquea PostgreSQL? | [Explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html) | Row locks, espera y deadlocks |
| ¿Qué hace SKIP LOCKED? | [SELECT](https://www.postgresql.org/docs/16/sql-select.html) | Cola de trabajo y lectura inconsistente del conjunto |
| ¿Qué garantiza Lua? | [Redis scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/) | Atomicidad dentro del servidor Redis |
| ¿Cómo funciona Transactional? | [Anotación y proxies](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html) | Self-invocation y manager |
| ¿Cómo delimitar transacciones explícitas? | [TransactionTemplate](https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/programmatic.html) | Callback y rollback |
| ¿Qué excepción revierte? | [Transactional API 6.2](https://docs.spring.io/spring-framework/docs/6.2.x/javadoc-api/org/springframework/transaction/annotation/Transactional.html) | Runtime/checked y reglas configurables |
| ¿Cómo usar hashes en Spring? | [Password storage](https://docs.spring.io/spring-security/reference/6.5/features/authentication/password-storage.html) | Encoder y Bouncy Castle |
| ¿Qué verifica un Resource Server? | [JWT resource server](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/resource-server/jwt.html) | Decoder, claims y authorities |
| ¿Cómo configurar audience en Boot? | [OAuth2](https://docs.spring.io/spring-boot/reference/security/oauth2.html) | audiences y overrides de beans |
| ¿Cómo hacer introspección? | [Opaque token support](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/resource-server/opaque-token.html) | Introspector y dependencia online |
| ¿Cómo delegar login web? | [OAuth2 Login](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/login/core.html) | Registro de cliente y callback |
| ¿Qué no prueba un mock JWT? | [Security testing](https://docs.spring.io/spring-security/reference/6.5/servlet/test/mockmvc/oauth2.html) | Autenticación sintética frente a decoder real |
| ¿Qué es un servidor de autorización Spring? | [Authorization Server overview](https://docs.spring.io/spring-authorization-server/reference/overview.html) | Responsabilidad y alcance del framework |

## Seguridad y protocolos

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): algoritmo, salt, coste y secretos adicionales.
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): identificadores de sesión y cookies.
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): defensa según credenciales y navegador.
- [Spring CSRF: stateless](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html): por qué stateless no elimina CSRF.
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html): identidad, ID token y flujos.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html): seguridad OAuth actual, flujos y refresh.
- [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662.html): contrato de introspección.

## Distribución y proveedores

- [Saga orchestration](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html): pasos locales y compensación.
- [Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html): escritura de estado y publicación.
- [Keycloak Docker](https://www.keycloak.org/getting-started/getting-started-docker): inicio del laboratorio.
- [Keycloak endpoints](https://www.keycloak.org/securing-apps/oidc-layers): discovery, token, JWKS e introspección.
- [Keycloak JavaScript](https://www.keycloak.org/securing-apps/javascript-adapter): cliente web y PKCE.
- [Keycloak administración](https://www.keycloak.org/docs/latest/server_admin/index.html): roles, scopes, audiencias y políticas de sesión.
- [Keycloak contenedores](https://www.keycloak.org/server/containers) y [alta disponibilidad](https://www.keycloak.org/high-availability/introduction): operación.
- [Auth0 IAM](https://auth0.com/docs/get-started/identity-fundamentals/identity-and-access-management), [Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html), [ZITADEL](https://zitadel.com/docs/guides/integrate/identity-providers/introduction), [Ory Hydra](https://www.ory.com/docs/network/hydra) y [Kratos](https://www.ory.com/docs/network/kratos/intro): alternativas y responsabilidades.

## Cómo evaluar un tutorial que encuentres

Comprueba si:

1. Declara versiones.
2. Distingue demostración de diseño completo.
3. Verifica firma y claims, no solo decodifica.
4. Distingue cookies de bearer explícito.
5. Prueba errores y concurrencia.
6. Explica dónde se confirma la transacción.
7. No llama OAuth a cualquier endpoint que emite JWT.

Si omite algo, puede seguir siendo útil para aprender una pieza. No le atribuyas garantías que no demuestra.
