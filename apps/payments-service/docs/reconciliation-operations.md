# Revisión operativa de pagos inciertos

Cuando el reconciliador agota `PAYMENTS_RECONCILER_MAX_ATTEMPTS`, conserva el recurso en `REVIEW_REQUIRED` y emite un evento `payment.v1.review_required` o `payment.v1.refund_review_required`. El estado bloquea nuevos cargos para la reserva o nuevos reembolsos para el pago. No reintentes el cargo ni el reembolso manualmente desde el proveedor.

## Escalamiento

1. Identifica el pago o reembolso por su UUID y revisa el historial de estado y el evento de revisión asociado.
2. Consulta la operación en la consola autoritativa del proveedor con el procedimiento de acceso aprobado por el equipo de pagos. Usa el identificador de operación disponible en el almacenamiento restringido; el historial solo conserva su hash de evidencia.
3. Obtén confirmación explícita de si el cargo o reembolso se completó, fue rechazado o sigue sin poder determinarse. La ausencia de un registro no demuestra rechazo.
4. Si el proveedor confirma el resultado, escala la evidencia al responsable de guardia para que la transición se resuelva mediante el flujo operativo aprobado y quede registrada en el historial. No edites estados ni el outbox directamente en SQL.
5. Si no existe evidencia concluyente, conserva `REVIEW_REQUIRED`, bloquea la operación relacionada y eleva el caso al equipo responsable del proveedor.

El servicio no ofrece un endpoint para forzar una transición o desbloquear una operación incierta. Las claves, tokens, PAN, correo y referencias del proveedor no deben incluirse en tickets, logs ni mensajes de evento.
