# AUTH-053 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: PRE-001 (verificada localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Probar criptográficamente la firma/verificación de access JWT con `Rs256TokenService` real y completar la
verificación de claims mínimos (`VerifiedAccessTokenClaims` con `iat`/`exp` numéricos).

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/application/ports/token-signer.port.ts` | Se añade `VerifiedAccessTokenClaims extends AccessTokenClaims { iat:number; exp:number }`; `verifyAccessToken` devuelve ese tipo. | La verificación descartaba `iat`/`exp` necesarios para TTL de caché (`min(exp-now, absoluteExpiry-now)`). |
| `apps/auth-service/src/infrastructure/security/rs256-token.service.ts` | `verifyAccessToken` valida UUID en `sub/sid/jti`, rol allowlist, `iat`/`exp` numéricos, `exp-iat === accessTokenTtlSeconds`, `iat` no futuro y lookup de `kid` por **propiedad propia**. | Cierra los huecos de H09. |
| `apps/auth-service/test/unit/access-token.spec.ts` | **Nuevo**. Matriz criptográfica con claves RSA efímeras y `jose` real. | Firmas reales, sin simular `jwtVerify`. |

## RED documentado (conducta ausente antes de la corrección)

La implementación previa aceptaba/rechazaba incorrectamente:

- `sub`/`sid`/`jti` vacíos o sin formato UUID (solo comprobaba `typeof === 'string'`).
- duración distinta de 3600 (`exp-iat` no se verificaba).
- `iat` futuro (no se comprobaba).
- no devolvía `iat`/`exp`, por lo que la ruta de caché no disponía de ellos.
- `kid` se resolvía por indexación simple, vulnerable a propiedades heredadas (`toString`, `__proto__`).

La corrección es la mínima para pasar la matriz; no se cambiaron `signAccessToken`, el emisor, ni el contrato.

## Cobertura de la matriz

- **Firma:** `RS256`/`kid`/`typ`, ocho claims canónicos (`iss,aud,iat,exp,sub,jti,sid,role`), `exp-iat=3600`,
  sin `email`/perfil; el firmante usa el `activeKid` durante rotación.
- **Verificación:** round-trip devuelve `{sub,sid,role,jti,iat,exp}` con `iat`/`exp` enteros.
- **Rechazos:** UUID vacíos/malformados; rol desconocido; `iat`/`exp` ausentes o no numéricos; token vencido;
  duración ≠ 3600; `iat` futuro; issuer/audience incorrectos; `kid` desconocido; firma con clave foránea
  (mismo `kid`); algoritmo `HS256`; tokens malformados (`''`, `a.b`, `a.b.c.d`, `alg:none`).
- **Rotación:** tokens firmados con clave vieja y nueva verifican si ambas están en el anillo; retirar la vieja
  invalida; la firma nueva usa el `activeKid`; `kid` heredado (`toString`/`__proto__`) se rechaza.

## Evidencia de comandos

Ejecutado desde la raíz del monorepo:

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects unit \
  --runTestsByPath test/unit/access-token.spec.ts   # 27/27
npm run test:unit   # 12 suites, 91 tests
npm run build       # OK
```

## Criterios de aceptación

- [x] Test usa firmas reales; no se simula `jose.jwtVerify`.
- [x] La verificación retorna tiempo suficiente para TTL seguro (`iat`/`exp`) y claims canónicos.

## Pendiente / handoff

- **AUTH-058/069:** consumen `VerifiedAccessTokenClaims` en la estrategia Passport/guards (aún no existen).
- **AUTH-071:** el controlador de introspección podrá pasar `accessTokenExpiresAt` local con `exp` verificado.
- Sin bloqueos de infraestructura: la suite es unitaria y no requiere PostgreSQL/Redis.
