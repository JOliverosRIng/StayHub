# Checklist de calidad de requisitos: Payments Service

Marca cada punto al revisar `spec.md`, `plan.md` y `tasks.md` **antes** de implementar.

## Trazabilidad

- [ ] Cada historia nombra su requisito fuente de `tendencias.md` (RQ-07, RQ-09, RQ-10, Sprint 3).
- [ ] Los RQ solo cubiertos parcialmente están declarados como parciales, sin afirmar cumplimiento end-to-end.
- [ ] Todo comportamiento ausente de `tendencias.md` aparece como decisión D-xx pendiente de aprobación (D-01…D-13), sin marcarlo aprobado por defecto.
- [ ] Cada `PAY-FR-###` tiene al menos una tarea y una prueba que lo verifica.

## Integridad del dinero

- [ ] Está definido qué pasa con reintentos, concurrencia y caídas a mitad del cobro.
- [ ] La unicidad de pago activo y el tope de reembolsos dependen de restricciones de base de datos, no solo de código.
- [ ] Los cambios de estado de Payment y Refund tienen historial inmutable independiente de la retención del outbox.
- [ ] El resultado ambiguo de la pasarela nunca se trata como rechazo, incluso cuando se agotan los intentos; `REVIEW_REQUIRED` conserva los bloqueos hasta evidencia definitiva.
- [ ] Están definidos COP/USD con dos decimales ISO 4217, monto máximo JSON seguro / SQL BIGINT y ejemplos equivalentes en quickstart y contratos.

## Seguridad

- [ ] No se reciben ni se guardan PAN, CVV ni el token en claro.
- [ ] Cada endpoint declara qué principal lo puede llamar (usuario, rol, scope de servicio).
- [ ] Hay pruebas negativas de JWT (`alg: none`, `kid`, audiencia, expiración) y de acceso entre usuarios.
- [ ] Los logs y eventos están definidos sin datos sensibles y con prueba.

## Contratos

- [ ] OpenAPI 3.1 cubre todas las respuestas (201, 202, 4xx, 503) y está validado contra la implementación.
- [ ] El JSON Schema de eventos nombra productor, consumidores, reintentos, escalamiento a revisión y manejo de fallos. Los 7 tipos/routing keys coinciden con spec/modelo/contratos.
- [ ] Los códigos de error (`code`) son estables y están enumerados.

## Arquitectura

- [ ] El dominio no depende de Nest, Prisma, HTTP ni RabbitMQ.
- [ ] El servicio no lee ni escribe en bases de otros servicios ni depende de que Bookings esté levantado.
- [ ] El servicio arranca y reporta `ready` con RabbitMQ caído.
- [ ] `restart: always` y health checks están en las tareas de Docker Compose.

## Alcance

- [ ] "Fuera de alcance" excluye pasarela real, payouts, políticas de cancelación y notificaciones.
- [ ] Las tareas `[compartido]` están marcadas y requieren aprobación del equipo.
- [ ] PAY-065 incluye actualización de GitHub Actions sin alterar jobs de otros equipos.
- [ ] Las tareas `[RED]` registran fallos esperados reales y `[GREEN]` pruebas verificadas; ningún commit RED se considera PR listo.
- [ ] El corte de US1–US3 se describe honestamente como **funcional provisional** (outbox escrito, relay y reconciliador pendientes); no se declara operativo final.
