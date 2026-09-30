# AUTH-081 — Integración HTTPS Gateway↔Auth

Estado inicial: pendiente. Tipo: Integración externa; requiere G1/G2.

## Resultado esperado y evidencia

Gateway no existe localmente. URL pública del contrato usa8443 y plan usa8080; se debe consumir una URL configurada acordada.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D05, D06, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-078](../AUTH-078/plan.md), [AUTH-079](../AUTH-079/plan.md), [AUTH-080](../AUTH-080/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/gateway-auth.spec.ts`
- `apps/auth-service/README.md`
- `agents/AUTH-081/resultado.md`

## Pasos de ejecución

1. Configurar GATEWAY_BASE_URL del entorno HTTPS aislado y CA de test confiable; no usar NODE_TLS_REJECT_UNAUTHORIZED=0. Registrar puerto real acordado por G1 sin hardcode8443/8080.
2. Recorrido público registro→login→validate→refresh→validate. Gateway usa service JWT para Auth y convierte principal/tokenType/user según OpenAPI público.
3. Comprobar refresh solo en cookie pública stayhub_refresh con Secure/HttpOnly y path acordado de refresh; no aparece en JSON público. Rotación cambia cookie;401 refresh la limpia según contrato G1.
4. Validar GET público /auth/validate termina en POST interno y compara role del JWT con rol Session. Token revocado/replay debe impedir acceso aunque firma siga válida.
5. Probar 401/429 Retry-After/503, traceId, eliminación de cabeceras de identidad cliente y timeouts. Las expectativas que falten en G1 se registran con dueño.
6. Guardar resultados contra tres servicios reales; no modificar Gateway desde Auth ni cerrar esta tarea con proxy stub.

## Criterios de aceptación

- [ ] Los cuatro mapeos públicos/internos funcionan por HTTPS.
- [ ] La cookie y el body respetan sus contratos separados.
- [ ] Replay invalida acceso a través del Gateway inmediatamente.

## Comprobación

```sh
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/gateway-auth.spec.ts
```

Routing/cookies/certificados públicos son entregables G1; Auth solo mantiene suite consumidora.

Al terminar, crear `agents/AUTH-081/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
