# AUTH-053 — Probar y completar verificación de access JWT

Estado inicial: pendiente. Tipo: Pruebas unitarias con corrección acotada.

## Resultado esperado y evidencia

Rs256TokenService existe, pero devuelve solo sub/sid/role/jti, no valida formato UUID y faltan pruebas criptográficas.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md).

## Archivos concretos

- `apps/auth-service/test/unit/access-token.spec.ts`
- `apps/auth-service/src/application/ports/token-signer.port.ts`
- `apps/auth-service/src/infrastructure/security/rs256-token.service.ts`

## Pasos de ejecución

1. Generar pares RSA efímeros; firmar JWT con Clock fijo; comprobar RS256/kid, ocho claims mínimos y exp-iat=3600; ausencia de email/perfil.
2. Crear VerifiedAccessTokenClaims extendiendo claims de entrada con iat/exp. verifyAccessToken devuelve estos valores numéricos; actualizar firmas dependientes.
3. Rechazar UUID vacíos/malformados, role desconocido, iat/exp ausentes/no numéricos, exp<=now, duración distinta 3600, iat futuro, issuer/aud equivocados y kid desconocido.
4. Probar algoritmo none/HS256 y firma con otra clave RSA, además de tokens malformados. Conservar allowlist RS256 e importar claves correctas.
5. Rotación: clave vieja y nueva verificables si publicKeys las contiene; firma nueva usa activeKid; retirar vieja la invalida. Probar key ring con propiedad heredada: lookup debe ser de propiedad propia.
6. Registrar RED de los casos que fallan hoy y hacer la mínima corrección del servicio existente.

## Criterios de aceptación

- [ ] Test usa firmas reales; no se simula jose.jwtVerify.
- [ ] Verificación retorna tiempo suficiente para TTL seguro y claims canónicos.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects unit --runTestsByPath test/unit/access-token.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-053/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
