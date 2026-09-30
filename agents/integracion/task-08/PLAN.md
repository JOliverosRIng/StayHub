# Task 08 — Verificación final y documentación

Estado inicial: PENDIENTE.
Origen: Fases E y cierre del plan de integración.
Dependencia: task-07 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-08/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Ejecutar únicamente cuando task-01–07 tengan evidencia de cierre. Revisar todos los resultados previos y el diff acumulado. Crear `agents/integracion/resultado.md` consolidado, además de `task-08/resultado.md`. Las pruebas anteriores no sustituyen la verificación final del conjunto. No marcar tareas de Gateway ni evidencia humana/remota no ejecutada.

## 9. Fase E — Verificación y documentación

Ejecutar desde raíz, con dependencias de pruebas aisladas ya configuradas:

```bash
npm run prisma:auth:generate
npm run prisma:users:generate
npm run typecheck
npm run lint
npm run build
npm run test:users
npm run test:auth
npm run openapi:auth:check
node scripts/validate-users-openapi.mjs
npm run test:auth-users
```

Durante A, ejecutar primero las suites dirigidas del nuevo endpoint. Para generar
OpenAPI Users, el mecanismo existente es `node scripts/validate-users-openapi.mjs --write`
después del build; revisar el diff y ejecutar de nuevo sin `--write` para verificarlo.

Las suites completas necesitan sus variables de conexión; revisar los helpers antes
de lanzarlas. No usar la base de desarrollo con helpers que borran datos.
Ejecutar cobertura de ambos workspaces sobre el entorno de pruebas y acreditar
al menos 70% en el código afectado conforme al proyecto.

Además de Jest, verificar los dos comandos de desarrollo reales:

- Arranque nativo, readiness de ambos, registro/login/perfil y parada limpia.
- Arranque contenedor, migraciones exitosas, readiness de ambos y mismo recorrido.
- Reinicio sin pérdida de usuarios ni regeneración involuntaria de secretos.
- Confirmar que no arrancó ningún `users-stub` en esos recorridos.
- Comprobar que la configuración Compose base no publica servicios internos.

Actualizar:

- `apps/auth-service/README.md` y `apps/users-service/README.md`.
- `docs/dev-swagger.md`, si existe, con pasos reales de ambos servicios.
- `agents/contrato-users-candidato.md`: aceptación técnica/implementación del GET
  y evidencia; no inventar una revisión humana de G1/G2.
- `agents/result/README.md`: enlace al nuevo resultado y alcance efectivamente verificado.
- `apps/users-service/REVALIDACION.md`: añadir sección de integración; conservar
  evidencia histórica y aclarar qué bloqueos antiguos fueron resueltos.
- Backlogs por servicio y `tasks.md`: sincronizar únicamente tareas acreditadas
  por esta ejecución. Una tarea mixta que también exige Gateway sigue abierta,
  con nota de la parte Auth↔Users completada.

No marcar USR-073/077, AUTH-078/081 ni el cierre global como completados: requieren
Gateway, HTTPS de borde u otra evidencia fuera de este trabajo. Tampoco dar por
aprobados revisiones humanas o CI remota que no se ejecutaron.

## 10. Evidencia y criterio de terminado

Crear `agents/integracion/resultado.md` con:

1. Fecha, commit base, versiones de Node/npm y engine usado.
2. Lista de archivos cambiados y propósito de cada grupo de cambios.
3. Contrato final del GET y configuración de confianza, sin valores secretos.
4. Tabla INT-01–17: PASS/FAIL/BLOQUEADO, prueba concreta y resultado observado.
5. Comandos ejecutados, códigos de salida, cantidades reales de tests y cobertura.
6. Evidencia de ambos modos de arranque y persistencia tras reinicio.
7. Recursos temporales creados/retirados y confirmación de conservación de datos previos.
8. Limitaciones pendientes, diferenciando Gateway de problemas de esta integración.

Checklist de cierre:

- [ ] GET Users implementado y protegido; estados/errores verificados.
- [ ] OpenAPI Users coincide con Swagger; contrato Auth sigue compatible.
- [ ] Auth usa Users real para registro y login.
- [ ] Users acepta JWT de login real de Auth y conserva ownership.
- [ ] JWT de servicio y de usuario tienen claves y usos separados.
- [ ] Ambos comandos de desarrollo funcionan sin proveedor Users simulado.
- [ ] Reiniciar desarrollo conserva usuarios y configuración criptográfica.
- [ ] Pruebas reales Auth↔Users pasan sin requerir Gateway.
- [ ] Recuperación ante pérdidas de respuesta y registros interrumpidos verificada.
- [ ] Lint, tipos, builds, contratos, regresión y cobertura acreditados.
- [ ] Documentación y resultado actualizados sin afirmar pruebas no ejecutadas.

Si alguna casilla falla, el resultado es parcial y debe indicar exactamente cuál,
por qué y qué evidencia falta. No declarar terminado por el solo hecho de compilar.

## Criterio de cierre de esta tarea

Todos los checks de cierre del plan acreditados, documentación sincronizada y resultado global con evidencia reproducible. Si falla algún check, informar resultado parcial y mantener la tarea abierta.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-08 del índice. Entregar el resultado global y los pendientes reales, si existen.
