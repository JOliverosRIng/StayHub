# Identity Requirements Quality Checklist: Fundamentos e identidad

**Purpose**: Evaluar si los requisitos de registro, autenticación, autorización y edición del
perfil cubren RQ-01 y RQ-02 con claridad, consistencia y detalle suficiente para derivar tareas
técnicas sin inventar comportamiento.
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

**Note**: Esta checklist personalizada fue generada por `$speckit-checklist` a partir del
contexto y los requisitos de la feature.
**Review Ownership**: Esta checklist es un artefacto de revisión de calidad de requisitos
propiedad del revisor. Marque un ítem `[x]` únicamente cuando el revisor determine que el
criterio de calidad del requisito está satisfecho.
**Marker Semantics**: `[x]` significa que el criterio fue revisado y satisfecho respecto a la
calidad de los requisitos; no significa que la implementación esté completa.

## Requirement Completeness

- [ ] CHK001 ¿RQ-01 está cubierto de extremo a extremo mediante requisitos sobre consulta del perfil propio, campos editables, validación, persistencia atómica, autorización y conservación del último estado válido? [Completitud, Spec §User Story 3–4, FR-014–FR-023]
- [ ] CHK002 ¿RQ-02 está cubierto de extremo a extremo mediante requisitos sobre datos básicos, roles permitidos, unicidad del correo, asignación atómica del rol y reintentos de registro? [Completitud, Spec §User Story 1, FR-001–FR-006]
- [ ] CHK003 ¿Los requisitos distinguen completamente las capacidades y restricciones de visitante, huésped, propietario y administrador dentro del alcance de esta feature? [Completitud, Spec §Actors, BR-001, BR-003, BR-006]
- [ ] CHK004 ¿El ciclo completo de autenticación está especificado desde login hasta acceso protegido, renovación, expiración y obligación de autenticarse nuevamente? [Completitud, Spec §User Story 2, FR-007–FR-013]
- [ ] CHK005 ¿Los límites de alcance enumeran explícitamente las capacidades de identidad excluidas para evitar que las tareas incorporen recuperación de contraseña, verificación de correo, MFA, eliminación o administración de otras cuentas? [Completitud, Spec §Scope Boundaries]

## Requirement Clarity

- [ ] CHK006 ¿La regla de asignación inicial de roles deja inequívoco qué roles puede solicitar públicamente un visitante y cómo queda excluido `ADMIN`? [Claridad, Spec §Clarifications, FR-001, BR-006]
- [ ] CHK007 ¿La equivalencia, normalización, unicidad y sustitución inmediata del correo están expresadas con criterios precisos y aplicables tanto al registro como al login y al perfil? [Claridad, Spec §Clarifications, FR-004, FR-017, BR-002]
- [ ] CHK008 ¿Las duraciones del access token y refresh token, el límite absoluto, la rotación y el efecto de reutilizar un refresh token están definidos sin interpretaciones alternativas? [Claridad, Spec §Clarifications, FR-010, BR-007]
- [ ] CHK009 ¿Las reglas de omisión y `null` distinguen claramente entre conservar, eliminar y rechazar valores para cada campo editable del perfil? [Claridad, Spec §User Story 3, FR-015]
- [ ] CHK010 ¿Los formatos y límites de nombre, correo, teléfono, foto y preferencias están descritos con suficiente precisión para clasificar objetivamente entradas válidas e inválidas? [Claridad, Spec §Clarifications, FR-016]
- [ ] CHK011 ¿Las respuestas `400`, `401` y `403` y sus condiciones están diferenciadas claramente, incluido qué información puede aparecer en los mensajes de error? [Claridad, Spec §User Stories 2–4, FR-008, FR-012–FR-013, FR-019, FR-021]

## Requirement Consistency

- [ ] CHK012 ¿Cada historia de usuario es consistente con los requisitos funcionales y reglas de negocio que la materializan, sin comportamientos adicionales ni omisiones? [Consistencia, Spec §User Stories 1–4, FR-001–FR-024, BR-001–BR-008]
- [ ] CHK013 ¿La descripción del administrador es consistente entre Actors, registro público, edición exclusiva del perfil propio y exclusión de administración de otras cuentas? [Consistencia, Spec §Actors, User Story 4, BR-006, Scope Boundaries]
- [ ] CHK014 ¿Las reglas del correo son consistentes entre escenarios de aceptación, requisitos funcionales, reglas de negocio, entidades y supuestos? [Consistencia, Spec §User Story 1 y 3, FR-004, FR-017, BR-002, Key Entities, Assumptions]
- [ ] CHK015 ¿La política de sesión y refresh token es consistente entre escenarios, FR-010, BR-007, entidades y criterios de éxito? [Consistencia, Spec §User Story 2, FR-010, BR-007, Key Entities, SC-003]
- [ ] CHK016 ¿El conjunto de campos de perfil editables y restringidos coincide en RQ-01, User Story 3–4, FR-015–FR-022 y la entidad Perfil de usuario? [Consistencia, Spec §Traceability RQ-01, User Stories 3–4, FR-015–FR-022, Key Entities]

## Acceptance Criteria Quality

- [ ] CHK017 ¿Cada historia dispone de escenarios Given/When/Then observables y de una prueba independiente que no dependa de funcionalidades fuera del alcance? [Criterios de aceptación, Spec §User Stories 1–4]
- [ ] CHK018 ¿Los criterios de RQ-01 cubren de forma verificable actualización válida, datos inválidos, correo duplicado, eliminación de opcionales, campos restringidos, perfil ajeno y ausencia de autenticación? [Criterios de aceptación, Spec §User Stories 3–4]
- [ ] CHK019 ¿Los criterios de RQ-02 cubren de forma verificable registro válido, datos obligatorios, correo duplicado, reintentos y rechazo del rol administrador en el registro público? [Criterios de aceptación, Spec §User Story 1, BR-006]
- [ ] CHK020 ¿Los criterios de seguridad permiten distinguir objetivamente autenticación válida, credenciales inválidas, token ausente/inválido/vencido, refresh reutilizado y falta de autorización? [Criterios de aceptación, Spec §User Story 2 y 4, FR-008–FR-013, FR-021]
- [ ] CHK021 ¿Los resultados medibles SC-001–SC-007 tienen población, porcentaje, tiempo y condición de prueba suficientes para evaluar cada afirmación sin introducir supuestos posteriores? [Mensurabilidad, Spec §Measurable Outcomes]

## Scenario Coverage

- [ ] CHK022 ¿Los recorridos principales de registro, login, renovación, validación de acceso, consulta y edición de perfil están todos representados por historias y escenarios? [Cobertura, Spec §User Stories 1–4]
- [ ] CHK023 ¿Los recorridos alternativos de actualización de correo, eliminación de datos opcionales y reemplazo o eliminación de foto/preferencias están suficientemente especificados? [Cobertura, Spec §User Story 3, FR-015–FR-017]
- [ ] CHK024 ¿Los flujos de excepción contemplan credenciales erróneas, tokens inválidos/vencidos/reutilizados, datos de perfil inválidos y campos desconocidos o restringidos? [Cobertura, Spec §User Stories 2–4, Edge Cases]
- [ ] CHK025 ¿Los flujos de recuperación indican el estado esperado después de interrupciones, reintentos, expiración durante una edición o rechazo de una actualización? [Cobertura de recuperación, Spec §Edge Cases, FR-005–FR-006, FR-018, FR-023]
- [ ] CHK026 ¿Los intentos no autorizados están cubiertos para falta de autenticación, rol insuficiente, acceso a identidad ajena y modificación de privilegios? [Cobertura de autorización, Spec §User Story 2 y 4, FR-011–FR-013, FR-020–FR-022]

## Edge Case Coverage

- [ ] CHK027 ¿Las colisiones concurrentes de registro con correos equivalentes y los reintentos del mismo registro tienen resultados no ambiguos y mutuamente consistentes? [Casos límite, Spec §User Story 1, Edge Cases, FR-004–FR-006]
- [ ] CHK028 ¿El conflicto entre dos actualizaciones del mismo perfil define suficientemente la ausencia de sobrescritura silenciosa y la información que necesita el usuario para continuar? [Casos límite, Spec §Edge Cases, FR-023]
- [ ] CHK029 ¿Los límites de foto, preferencias, teléfono, nombre y correo incluyen comportamiento para formatos incorrectos, tamaños máximos, opcionales ausentes y valores nulos? [Casos límite, Spec §Edge Cases, FR-015–FR-016]
- [ ] CHK030 ¿La expiración, rotación y reutilización de refresh tokens cubren solicitudes simultáneas o repetidas sin dejar ambiguo el estado final de la sesión? [Casos límite, Spec §User Story 2, FR-010, BR-007]

## Non-Functional and Security Requirements

- [ ] CHK031 ¿Los requisitos de confidencialidad especifican de forma suficiente qué secretos y datos personales deben quedar fuera de consultas, confirmaciones, errores, eventos y registros? [Seguridad, Spec §FR-024, Constitution §V]
- [ ] CHK032 ¿Las reglas de mínimo privilegio y defensa contra acceso cruzado están expresadas para todas las operaciones protegidas del alcance, no solo para la edición del perfil? [Seguridad, Spec §FR-011–FR-013, FR-020–FR-022, Constitution §V]
- [ ] CHK033 ¿La prevención de enumeración de cuentas y la neutralidad del mensaje de login inválido están especificadas de forma comprobable y consistente? [Seguridad, Spec §User Story 2, FR-008]
- [ ] CHK034 ¿Los objetivos de rendimiento y usabilidad relevantes para registro, login y perfil están cuantificados y vinculados con condiciones de aceptación reproducibles? [No funcional, Spec §SC-001, SC-005–SC-006]

## Dependencies and Assumptions

- [ ] CHK035 ¿La trazabilidad demuestra explícitamente que cada aspecto de RQ-01 y RQ-02 tiene historia, requisito funcional y evidencia esperada, sin depender solo de una referencia por rango? [Trazabilidad, Spec §Traceability, SC-007]
- [ ] CHK036 ¿Los supuestos sobre registro público, correo como identificador, opcionalidad de campos y exclusiones están validados por requisitos normativos y no contradicen escenarios? [Supuestos, Spec §Assumptions, FR-001, FR-015, Scope Boundaries]
- [ ] CHK037 ¿Las decisiones del plan técnico pueden derivarse de la especificación y la constitution sin introducir comportamiento funcional nuevo para usuarios, roles, sesiones o perfiles? [Derivabilidad, Spec §FR-001–FR-024, Plan §Runtime Flows, Constitution §VIII]

## Ambiguities and Conflicts

- [ ] CHK038 ¿Todos los términos con impacto funcional —“sesión”, “rol vigente”, “refresh token válido”, “preferencia escalar”, “campo restringido” y “proceso interno autorizado”— tienen una interpretación única o un límite de alcance explícito? [Ambigüedad, Spec §Key Entities, Business Rules]
- [ ] CHK039 ¿La especificación resuelve o acota cualquier diferencia entre actualizar “como una sola operación”, los reintentos distribuidos y la prohibición de estados parciales, de modo que las tareas no deban inventar una garantía? [Ambigüedad, Spec §User Story 1 y 3, FR-005–FR-006, FR-018, BR-005]
- [ ] CHK040 ¿La especificación contiene información suficiente para descomponer tareas de dominio, validación, seguridad, contratos y pruebas sin decidir nuevamente reglas de negocio ni estados de error? [Preparación para tareas, Spec §User Stories, Requirements, Edge Cases, Success Criteria]

## Notes

- Marque ítems `[x]` solo después de que la revisión confirme el criterio de calidad del requisito.
- Mantenga sin marcar los criterios que requieran aclaración, corrección o evaluación adicional.
- `$speckit-implement` lee el estado de la checklist como gate y no debe modificar marcadores.
- `checklists/requirements.md` tiene un ciclo de vida independiente mantenido por
  `$speckit-specify` y `$speckit-clarify`.
- Añada hallazgos y enlaces junto al ítem correspondiente.
- Los identificadores son secuenciales para facilitar referencias en revisión.
