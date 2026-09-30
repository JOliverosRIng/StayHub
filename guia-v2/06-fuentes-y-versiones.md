# 6. Fuentes oficiales y versiones

[Índice](README.md)

Versiones consultadas el **2026-09-28** en las páginas oficiales enlazadas. Son las que sitúan los ejemplos; no se instalaron ni compilaron en esta revisión. Antes de empezar, vuelve a mirar cada enlace y anota en tu bitácora la versión exacta que instalas.

## Versiones

| Área | Versión de referencia | Fuente | Notas |
|---|---|---|---|
| Node.js | **24 LTS** (24.21.0 al consultar). 22 también es LTS | [Node.js Releases](https://nodejs.org/en/about/previous-releases) | 20 figura como **EOL** (última versión 24-mar-2026). 26 es Current, no LTS |
| NestJS | **12.x** (12.1.1 publicada el 2026-09-28) | [Releases de nestjs/nest](https://github.com/nestjs/nest/releases) | Nest 12 exige Node 20.19+ o 22.12+. La línea 11.2.x sigue recibiendo parches. No verifiqué el estado de soporte de Nest 10 |
| Prisma ORM | **7.x** (7.10.0 estable) | [Releases de prisma/orm](https://github.com/prisma/orm/releases) | Prisma 8 está en release candidate; no lo uses para aprender. Prisma 6 es dos majors atrás |
| jose (npm) | **6.x** (6.2.12) | [Releases de panva/jose](https://github.com/panva/jose/releases) | Si partes de un proyecto con jose 5, revisa la guía de migración antes de mezclar ejemplos |
| Java | 21 o 25 (LTS) | [Spring Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html) | No verifiqué el mínimo exacto de Boot 4.1; consúltalo en ese enlace |
| Spring Boot | **4.1.x** (4.1.1 al consultar) | [Spring Boot](https://spring.io/projects/spring-boot) | Usa el BOM/parent de Boot para alinear Framework y Security |
| Spring Framework | 7.0.x (7.0.8 en la página del proyecto) | [Spring Framework](https://spring.io/projects/spring-framework) | No fijes su versión a mano: la trae Boot |
| Spring Security | 7.1.x (7.1.0 en la página del proyecto) | [Spring Security](https://spring.io/projects/spring-security) | Ídem |
| PostgreSQL | 16 (la imagen `postgres:16` resolvió a 16.15 al descargarla el 2026-09-28) | [Docker Hub: postgres](https://hub.docker.com/_/postgres) | H2 o mocks no reproducen sus locks ni sus índices parciales |
| Keycloak | **26.7.4** | [Downloads](https://www.keycloak.org/downloads), [Docker](https://www.keycloak.org/getting-started/getting-started-docker) | `start-dev` es solo para desarrollo |
| keycloak-js | 26.2.4 | [Downloads (Client Adapters)](https://www.keycloak.org/downloads) | Se publica por separado del servidor |

### Spring Boot 3.5 / Framework 6.2 / Security 6.5

La versión anterior de esta guía usaba esa combinación. **No pude confirmar la fecha exacta de fin de soporte OSS** porque la tabla de soporte de spring.io no cargó en la consulta. Sí confirmé que las versiones actuales son Boot 4.1.x, Framework 7.0.x y Security 7.1.x, así que los ejemplos del [recorrido Spring](spring/README.md) se migraron a esa línea. Si necesitas quedarte en 3.5, consulta [spring.io/projects/spring-boot#support](https://spring.io/projects/spring-boot#support) y la documentación versionada 3.5 / 6.5; no mezcles fragmentos de ambas generaciones.

## Leer por pregunta

| Pregunta | Fuente primaria | Qué buscar |
|---|---|---|
| ¿Qué puede inyectar Nest? | [Custom providers](https://docs.nestjs.com/fundamentals/custom-providers) | Tokens, factories, aliases y exports |
| ¿En qué orden ocurre HTTP? | [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle) | Guards antes de pipes/interceptors de entrada |
| ¿Cómo rechazar campos extra? | [Validation](https://docs.nestjs.com/techniques/validation) | whitelist, forbidNonWhitelisted, transform |
| ¿Qué cambió en Nest 12? | [Migration guide](https://docs.nestjs.com/migration-guide) | ESM, Standard Schema, nueva CLI |
| ¿Cómo aislar dependencias en Nest? | [Testing](https://docs.nestjs.com/fundamentals/testing) | TestingModule y overrides |
| ¿Qué confirma Prisma junto? | [Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) | Transacciones interactivas y límites |
| ¿Qué bloquea PostgreSQL? | [Explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html) | Row locks, espera y deadlocks |
| ¿Qué ve una transacción que espera? | [Transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html) | READ COMMITTED y relectura tras FOR UPDATE |
| ¿Cómo funciona @Transactional? | [Declarative transactions](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html) | Proxies y self-invocation |
| ¿Cómo delimitar transacciones a mano? | [Programmatic transactions](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html) | TransactionTemplate |
| ¿Cómo usar Argon2 en Spring? | [Password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html), [Argon2PasswordEncoder](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/crypto/argon2/Argon2PasswordEncoder.html) | Constructor y Bouncy Castle |
| ¿Qué verifica un Resource Server? | [JWT resource server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) | Decoder, claims y authorities |
| ¿Cómo configurar audience en Boot? | [OAuth2 en Boot](https://docs.spring.io/spring-boot/reference/security/oauth2.html) | issuer-uri, audiences |
| ¿Qué no prueba un mock JWT? | [Testing OAuth2](https://docs.spring.io/spring-security/reference/servlet/test/mockmvc/oauth2.html) | Autenticación sintética frente a decoder real |
| ¿Cómo verificar un JWT en Node? | [jose: jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md), [createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) | issuer, audience, algorithms |
| ¿Cómo configuro MFA, email y reset en Keycloak? | [Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/index.html) | OTP policies, Passkeys, Forgot password, Verify email |

Los enlaces de Spring sin número de versión apuntan a la documentación **actual**. Los de jose apuntan a la rama principal del repositorio; si instalas otra major, cambia la rama.

## Seguridad y protocolos

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): Argon2id, salt, coste, pepper.
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): identificadores de sesión y cookies.
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): tokens de un solo uso y mensajes uniformes.
- [OWASP Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
- [Spring: CSRF y aplicaciones stateless](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html).
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html): OAuth 2.0 Security BCP.
- [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html): PKCE.
- [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662.html): introspección.
- [passkeys.dev](https://passkeys.dev/device-support/): soporte de passkeys por dispositivo.

## Cómo evaluar un tutorial que encuentres

Comprueba si:

1. Declara versiones.
2. Distingue demostración de diseño completo.
3. Verifica firma y claims, no solo decodifica.
4. Distingue cookies de bearer explícito.
5. Prueba errores y concurrencia.
6. Explica dónde se confirma la transacción.
7. No llama OAuth a cualquier endpoint que emite JWT.
