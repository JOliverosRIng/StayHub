# AUTH-068 — Implementar introspección autoritativa

Estado inicial: pendiente. Tipo: Implementación caso de uso.

## Resultado esperado y evidencia

Hay SessionRepository.findById y caché, pero no decisión de sesión activa ni vínculo userId. El request HTTP carece exp.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-057](../AUTH-057/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/sessions/validate-session.use-case.ts`
- `apps/auth-service/test/integration/session-validation.spec.ts`
- `apps/auth-service/test/unit/validate-session.use-case.spec.ts`

## Pasos de ejecución

1. execute({sessionId,userId,accessTokenExpiresAt?}) carga Session desde PostgreSQL y verifica igualdad userId e isActive(Clock.now()). No devolver existencia distinta al cliente.
2. Retornar {active:true,role:session.role}; inexistente/mismatch/vencida/revocada lanza SessionInvalidError.
3. DB falla→DependencyUnavailableError. Redis cache falla→ignorar/fallback seguro; ningún hit positivo puede autorizar antes de leer DB.
4. Sin accessTokenExpiresAt no escribir caché positiva. Con fecha confiable de JWT local, limitar TTL al mínimo de vida JWT/sesión, floor en segundos; saltar TTL<=0.
5. Invalidar cache obsoleta best-effort tras rechazo sin sustituir decisiónDB. No comprobar rol vigente Users ni cambiar role de Session.
6. Ejecutar AUTH-057 incluyendo stale cache y revocación concurrente después de refresh.

## Criterios de aceptación

- [ ] Cada autorización depende del estado PostgreSQL vigente.
- [ ] La ruta HTTP conserva input actual y no inventa expiry.
- [ ] Tres roles y todas las causas 401/503 probadas.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/session-validation.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-068/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
