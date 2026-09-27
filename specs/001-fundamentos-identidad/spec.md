# Feature Specification: Fundamentos e identidad

**Feature Branch**: `N/A (no branch hook configured)`

**Created**: 2026-09-25

**Status**: Draft

**Input**: Registro, asignación de roles, inicio y renovación de sesión, validación de
autenticación y edición autorizada del perfil, con trazabilidad a RQ-01, RQ-02 y Sprint 1.

## Context & Objective

Esta feature establece el primer incremento funcional de StayHub: una persona puede crear una
cuenta con un rol permitido, iniciar y mantener una sesión, demostrar su identidad ante
operaciones protegidas y administrar su propio perfil. Su objetivo es proporcionar una base de
identidad confiable para las funcionalidades posteriores del proyecto, sin incluir todavía
capacidades de alojamientos, búsqueda, reservas ni administración general de usuarios.

## Clarifications

### Session 2026-09-25

- Q: ¿Cómo se asignará el rol inicial al registrar una cuenta? → A: El visitante elige huésped o propietario; administrador solo mediante un proceso interno autorizado.
- Q: ¿Cómo debe tratarse el correo para comprobar unicidad y qué debe ocurrir después de actualizarlo? → A: La unicidad ignora mayúsculas y espacios exteriores; el correo nuevo sirve inmediatamente para login y el anterior deja de servir.
- Q: ¿Qué política de expiración y renovación debe aplicar cada sesión iniciada correctamente? → A: Access token de 1 hora; refresh token de 7 días desde el login, rotado en cada renovación; su reutilización exige nuevo login.
- Q: ¿Cómo debe distinguir el sistema entre credenciales inválidas, autenticación inválida y falta de autorización? → A: Login inválido y autenticación ausente, inválida o vencida devuelven 401; falta de permiso o acceso a otro perfil devuelve 403; nunca se aplican cambios.
- Q: ¿Qué contrato de validación debe aplicarse al editar los campos permitidos del perfil? → A: Nombre de 2–100 caracteres; correo válido de máximo 254; teléfono E.164; foto JPEG/PNG de máximo 5 MB; hasta 20 preferencias escalares; null elimina datos opcionales y todo campo desconocido o restringido rechaza la actualización con 400.

### Session 2026-09-26

- Q: ¿Cómo se cierran las decisiones pendientes detectadas antes de implementar? → A: La creación o cambio de rol `ADMIN` queda como dependencia externa; los estados internos `PENDING` son válidos mientras nunca sean visibles ni autenticables; la contraseña de registro admite 8–128 caracteres sin transformación automática; y el rol queda fijado al iniciar la sesión y es la autoridad durante toda ella.
- Q: ¿Qué límites de abuso son observables? → A: Registro admite 10 solicitudes por origen de red en 10 minutos; login admite 30 intentos por origen en 5 minutos y 5 fallos por identificador normalizado en 15 minutos. Al excederlos se responde 429 con `Retry-After`; un login correcto limpia el contador del identificador y toda ventana se recupera automáticamente al vencer.
- Q: ¿Cómo se medirán los criterios no funcionales? → A: Rendimiento usa el perfil reproducible definido en el plan; usabilidad usa 20 participantes representativos sin experiencia previa con StayHub y evidencia agregada desidentificada; el tiempo de confirmación de perfil se mide en 20 recorridos exitosos de navegador.

### Actors

- **Visitante**: persona sin sesión que puede registrarse e iniciar sesión.
- **Huésped**: usuario autenticado con el rol que habilita el uso futuro de servicios para
  buscar y reservar alojamientos. En esta feature administra únicamente su propia identidad.
- **Propietario**: usuario autenticado con el rol que habilita la gestión futura de
  alojamientos. En esta feature administra únicamente su propia identidad.
- **Administrador**: usuario autenticado con permisos administrativos definidos por el
  proyecto. En esta feature puede autenticarse y editar su propio perfil; la administración de
  otras cuentas queda fuera del alcance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar una cuenta con rol (Priority: P1)

Como visitante, quiero registrarme con mis datos básicos y un rol permitido para obtener una
identidad dentro de StayHub y acceder posteriormente a las capacidades correspondientes.

**Why this priority**: El registro materializa RQ-02 y crea la identidad necesaria para todos
los demás recorridos de esta feature.

**Independent Test**: Se puede probar creando una cuenta con nombre, correo, contraseña y rol,
y verificando que el nuevo usuario queda disponible para iniciar sesión sin depender de la
edición del perfil.

**Acceptance Scenarios**:

1. **Given** un visitante con datos válidos y un correo no registrado, **When** completa el
   registro eligiendo el rol huésped o propietario, **Then** el sistema crea una sola cuenta,
   conserva el rol asignado y confirma el registro.
2. **Given** un visitante que omite un dato obligatorio o proporciona un correo inválido,
   **When** intenta registrarse, **Then** el sistema rechaza el registro, identifica los datos
   que requieren corrección y no crea una cuenta parcial.
3. **Given** que ya existe una cuenta con el mismo correo, **When** se intenta registrar otra
   cuenta, **Then** el sistema rechaza la duplicación sin alterar la cuenta existente.
4. **Given** un registro válido que se envía más de una vez por error, **When** el sistema
   procesa los envíos, **Then** conserva una sola cuenta y presenta un resultado coherente.

---

### User Story 2 - Iniciar y renovar una sesión (Priority: P1)

Como usuario registrado, quiero iniciar sesión, renovar una sesión válida y demostrar que estoy
autenticado para acceder de forma continua a operaciones protegidas.

**Why this priority**: La autenticación es el segundo criterio funcional de Sprint 1 y protege
la edición del perfil y las capacidades posteriores del producto.

**Independent Test**: Se puede probar con una cuenta preparada previamente, verificando el
inicio de sesión, la renovación mediante un refresh token y la aceptación o rechazo de una
operación protegida según el estado de autenticación.

**Acceptance Scenarios**:

1. **Given** un usuario registrado con credenciales válidas, **When** inicia sesión, **Then** el
   sistema autentica su identidad, reconoce su rol y crea una sesión utilizable.
2. **Given** un usuario que presenta credenciales incorrectas, **When** intenta iniciar sesión,
   **Then** el sistema responde con 401 y un mensaje genérico sin revelar cuál dato de la
   credencial fue incorrecto.
3. **Given** una sesión renovable y un refresh token válido, **When** el usuario solicita
   continuar su sesión dentro de los 7 días siguientes al login, **Then** el sistema emite un
   access token válido por 1 hora y un nuevo refresh token, e invalida el refresh token usado.
4. **Given** un refresh token inválido, vencido o que ya no es aceptable, **When** se intenta
   renovar la sesión, **Then** el sistema rechaza la renovación y exige una nueva autenticación.
5. **Given** un refresh token que ya fue usado y sustituido, **When** se intenta reutilizarlo,
   **Then** el sistema invalida la sesión renovada y exige un nuevo inicio de sesión.
6. **Given** una operación protegida, **When** la identidad autenticada es válida, **Then** el
   sistema permite continuar de acuerdo con su rol.
7. **Given** una operación protegida, **When** falta una autenticación válida, **Then** el
   sistema responde con 401 y deniega la operación sin ejecutar cambios.
8. **Given** un usuario autenticado que carece del rol o permiso requerido por una operación
   protegida, **When** intenta ejecutarla, **Then** el sistema responde con 403 sin aplicar
   cambios.

---

### User Story 3 - Consultar y editar el perfil propio (Priority: P2)

Como usuario autenticado, quiero consultar y actualizar mi nombre, correo, teléfono, foto de
perfil y preferencias para mantener mi información vigente.

**Why this priority**: Implementa RQ-01 y completa el valor funcional previsto para Sprint 1
una vez que la identidad del usuario puede autenticarse.

**Independent Test**: Se puede probar con una cuenta autenticada, modificando cada campo
permitido y verificando que los cambios válidos persisten y se muestran al volver a consultar
el perfil.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado que consulta su perfil, **When** solicita su información,
   **Then** el sistema presenta los datos asociados a su propia identidad.
2. **Given** un usuario autenticado con cambios válidos, **When** actualiza nombre, correo,
   teléfono, foto o preferencias, **Then** el sistema valida y guarda los cambios como una sola
   actualización y muestra una confirmación.
3. **Given** un cambio con datos inválidos, **When** el usuario intenta guardarlo, **Then** el
   sistema responde con 400, señala los campos que requieren corrección y conserva el último
   perfil válido.
4. **Given** un correo nuevo que ya pertenece a otra cuenta, **When** el usuario intenta
   guardarlo en su perfil, **Then** el sistema rechaza el cambio y mantiene su correo anterior.
5. **Given** un usuario que actualizó correctamente su correo, **When** vuelve a iniciar sesión,
   **Then** el sistema acepta inmediatamente el correo nuevo y deja de aceptar el anterior.
6. **Given** un usuario que envía `null` para teléfono, foto o preferencias, **When** actualiza
   su perfil, **Then** el sistema elimina únicamente esos datos opcionales y conserva los demás.
7. **Given** una actualización que incluye un campo desconocido o restringido, **When** el
   usuario intenta guardarla, **Then** el sistema responde con 400 y no aplica ningún cambio.

---

### User Story 4 - Restringir modificaciones no autorizadas (Priority: P2)

Como usuario autenticado, quiero que solo mi identidad pueda modificar mi perfil para evitar
que otros usuarios cambien mis datos o privilegios.

**Why this priority**: La protección de datos personales y la autorización por rol son
condiciones obligatorias del proyecto y del alcance solicitado para esta feature.

**Independent Test**: Se puede probar con dos cuentas distintas, intentando modificar el perfil
de una cuenta desde la sesión de la otra y verificando que la operación se deniega y no produce
cambios.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado, **When** intenta actualizar el perfil de otra identidad,
   **Then** el sistema responde con 403 y el perfil objetivo permanece intacto.
2. **Given** un usuario autenticado, **When** intenta cambiar su rol mediante la edición de
   perfil, **Then** el sistema responde con 400, rechaza la actualización completa y conserva
   el rol vigente.
3. **Given** un administrador autenticado dentro de esta feature, **When** edita su perfil,
   **Then** solo puede modificar los campos permitidos de su propia identidad.
4. **Given** una solicitud de actualización sin autenticación válida, **When** intenta guardar
   cambios, **Then** el sistema responde con 401, deniega la operación y no modifica
   información de usuario.

### Edge Cases

- Dos solicitudes de registro llegan casi al mismo tiempo con el mismo correo: solo una cuenta
  puede quedar creada.
- Un usuario reintenta un registro o una actualización después de una interrupción: el sistema
  no debe crear duplicados ni aplicar parcialmente los cambios.
- Una sesión deja de ser válida entre la consulta y el guardado del perfil: el cambio debe ser
  rechazado y el usuario debe volver a autenticarse.
- El refresh token es válido en formato, pero ya venció o dejó de ser aceptable: la renovación
  debe fallar sin crear una nueva sesión.
- El usuario cambia su correo por una variante que coincide con otro correo registrado: la
  regla de unicidad debe seguir aplicándose.
- La foto de perfil no es JPEG o PNG, o supera 5 MB: se responde con 400, se rechaza toda la
  actualización y se conserva la foto vigente.
- Una preferencia opcional se elimina: el sistema conserva el resto del perfil y representa la
  ausencia de esa preferencia sin inventar un valor.
- Dos actualizaciones del mismo perfil entran en conflicto: el sistema evita una sobrescritura
  silenciosa y comunica que el usuario debe revisar la versión vigente.
- Se incluyen campos desconocidos o restringidos en una actualización: el sistema responde con
  400, rechaza toda la actualización y no altera el rol ni la identidad propietaria del perfil.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir registrar públicamente una cuenta con nombre, correo,
  contraseña y el rol huésped o propietario.
- **FR-002**: El sistema MUST reconocer exactamente los roles de huésped, propietario y
  administrador definidos por el proyecto.
- **FR-003**: El sistema MUST validar la presencia y formato de los datos obligatorios antes de
  crear una cuenta. La contraseña de registro MUST contener entre 8 y 128 caracteres y MUST
  evaluarse exactamente como fue introducida, sin recorte, cambio de mayúsculas ni normalización.
- **FR-004**: El sistema MUST recortar los espacios exteriores y comparar el correo sin
  distinguir mayúsculas de minúsculas para impedir que dos cuentas compartan correos
  equivalentes.
- **FR-005**: El sistema MUST exponer el registro como una única operación: solo puede confirmar
  éxito cuando usuario, rol y credencial estén completos y activos. Los estados internos de
  recuperación MUST permanecer invisibles y no autenticables, y MUST finalizar como activos o
  cancelados mediante reintento, reconciliación o expiración.
- **FR-006**: El sistema MUST impedir que los reintentos accidentales de registro creen cuentas
  duplicadas.
- **FR-007**: El sistema MUST permitir iniciar sesión a un usuario registrado mediante sus
  credenciales válidas.
- **FR-008**: El sistema MUST rechazar credenciales incorrectas con estado 401 y un mensaje
  genérico que no revele cuál dato fue incorrecto ni si la cuenta existe.
- **FR-009**: El sistema MUST asociar cada sesión autenticada con la identidad y el rol vigentes
  al iniciar sesión. Ese rol MUST quedar fijado como autoridad de la sesión, conservarse en sus
  renovaciones y utilizarse al validar acceso. Cualquier proceso futuro que cambie un rol MUST
  revocar las sesiones afectadas antes de que el cambio sea efectivo.
- **FR-010**: Al iniciar sesión, el sistema MUST emitir un access token válido por 1 hora y un
  refresh token con vencimiento absoluto a los 7 días desde el login. Cada renovación MUST
  invalidar el refresh token presentado y emitir un access token y un refresh token nuevos sin
  extender el vencimiento absoluto. Un token inválido, vencido o reutilizado MUST impedir la
  renovación; la reutilización de un token ya rotado MUST invalidar la sesión renovada y exigir
  un nuevo login.
- **FR-011**: El sistema MUST validar la autenticación antes de permitir cualquier operación
  protegida de esta feature.
- **FR-012**: El sistema MUST responder con estado 401 y denegar una operación protegida cuando
  el access token falte, sea inválido o esté vencido, sin aplicar cambios parciales.
- **FR-013**: El sistema MUST aplicar las restricciones asociadas al rol autenticado cuando se
  evalúe el acceso a una operación protegida y responder con estado 403, sin aplicar cambios,
  cuando el usuario autenticado carezca del rol o permiso requerido.
- **FR-014**: El sistema MUST permitir que un usuario autenticado consulte su propio perfil.
- **FR-015**: El sistema MUST permitir actualizar nombre, correo, teléfono, foto de perfil y
  preferencias del usuario autenticado. Un campo omitido MUST conservar su valor; `null` MUST
  eliminar teléfono, foto o preferencias, pero MUST ser rechazado para nombre y correo.
- **FR-016**: Antes de conservarlos, el sistema MUST sanear los datos y validar estas reglas:
  nombre de 2 a 100 caracteres después de recortar espacios exteriores; correo con formato
  válido y máximo 254 caracteres; teléfono opcional en formato E.164; foto opcional como
  archivo JPEG o PNG de máximo 5 MB; y preferencias opcionales como objeto de hasta 20 pares
  clave-valor, con valores escalares.
- **FR-017**: El sistema MUST comprobar nuevamente la unicidad normalizada definida en FR-004
  cuando se modifica el correo. Tras una actualización exitosa, el correo nuevo MUST quedar
  habilitado inmediatamente para iniciar sesión y el anterior MUST dejar de ser aceptado.
- **FR-018**: El sistema MUST guardar una actualización de perfil de forma completa o no
  guardar ninguno de sus cambios.
- **FR-019**: El sistema MUST confirmar una actualización exitosa. Ante datos inválidos o la
  presencia de cualquier campo desconocido o restringido, MUST responder con estado 400,
  identificar los campos que requieren corrección y rechazar la actualización completa.
- **FR-020**: Un usuario autenticado MUST poder modificar únicamente el perfil asociado a su
  propia identidad dentro del alcance de esta feature.
- **FR-021**: El sistema MUST responder con estado 403 y rechazar cualquier intento autenticado
  de editar el perfil de otra identidad, aunque el solicitante conozca su identificador.
- **FR-022**: El sistema MUST impedir que el rol, el propietario del perfil u otros atributos
  restringidos sean modificados mediante la edición del perfil.
- **FR-023**: El sistema MUST conservar el último estado válido del perfil cuando una
  actualización sea rechazada o interrumpida.
- **FR-024**: Las contraseñas y los refresh tokens MUST permanecer ocultos en consultas,
  confirmaciones y mensajes de error dirigidos al usuario.

### Key Entities *(include if feature involves data)*

- **Usuario**: identidad registrada en StayHub; incluye un identificador estable, nombre,
  correo, estado de autenticación relacionado y un único rol vigente.
- **Rol**: categoría de autorización asignada al usuario; sus valores permitidos son huésped,
  propietario y administrador.
- **Credencial**: información secreta usada para demostrar la identidad durante el inicio de
  sesión; nunca forma parte de los datos visibles del perfil.
- **Sesión autenticada**: periodo iniciado por un login correcto, con un límite absoluto de 7
  días, durante el cual la identidad y el rol pueden demostrarse mediante tokens válidos.
- **Refresh token**: comprobante de un solo uso asociado a una sesión que permite solicitar su
  renovación antes del límite absoluto; cada uso válido lo sustituye por uno nuevo.
- **Perfil de usuario**: información editable vinculada de forma exclusiva a un usuario;
  contiene nombre, correo, teléfono opcional, foto de perfil opcional y preferencias
  opcionales. Solo nombre, correo, teléfono, foto y preferencias son editables en esta feature.
- **Preferencia**: elección opcional del usuario almacenada como parte de su perfil y destinada
  a personalizar interacciones futuras sin cambiar sus permisos.

### Business Rules

- **BR-001**: Todo usuario registrado tiene exactamente uno de los tres roles definidos por el
  proyecto.
- **BR-002**: El correo identifica de forma única una cuenta; las diferencias únicamente de
  mayúsculas, minúsculas o espacios exteriores no crean identidades distintas.
- **BR-003**: El rol no es un campo editable del perfil.
- **BR-004**: La edición del perfil solo puede actuar sobre la identidad autenticada que la
  solicita.
- **BR-005**: Los cambios inválidos o no autorizados no pueden modificar parcialmente una
  cuenta o perfil.
- **BR-006**: El registro público MUST NOT permitir solicitar el rol administrador. Su
  aprovisionamiento y cualquier cambio de rol son una dependencia externa y no forman parte de
  esta feature; las pruebas usan únicamente cuentas `ADMIN` preaprovisionadas o fixtures.
- **BR-007**: Una sesión solo puede renovarse antes de cumplirse 7 días desde el login y
  mientras su refresh token vigente conserve validez; la renovación no extiende ese límite.
- **BR-008**: Las preferencias son opcionales; nombre, correo y contraseña son obligatorios
  para el registro.
- **BR-009**: Los límites de abuso definidos para registro y login MUST aplicarse sin revelar si
  una cuenta existe, MUST informar el tiempo de recuperación mediante `Retry-After` y MUST
  recuperarse automáticamente al vencer su ventana.

### Scope Boundaries

Esta feature incluye registro, asignación inicial autorizada de rol, inicio y renovación de
sesión, validación de autenticación, consulta del perfil propio y edición de los campos
indicados. Quedan fuera de alcance el aprovisionamiento de administradores, los cambios de rol,
la recuperación o cambio de contraseña, verificación de correo, autenticación multifactor,
eliminación de cuentas, administración de otras cuentas y cualquier capacidad relacionada con
alojamientos, búsquedas, reservas, pagos o reseñas.

### Traceability

| Source | Covered by | Evidence expected |
|--------|------------|-------------------|
| RQ-01: edición del perfil | User Stories 3-4; FR-014 a FR-024 | Un usuario autenticado actualiza solo su perfil y los datos válidos persisten. |
| RQ-02: crear usuario y asignar rol | User Story 1; FR-001 a FR-006 | Una cuenta única se crea públicamente como huésped o propietario; ADMIN se valida con cuenta preaprovisionada y su proceso de creación queda registrado como dependencia externa. |
| Sprint 1: registro e inicio de sesión | User Stories 1-2; FR-001 a FR-013 | Un usuario puede registrarse, iniciar sesión y acceder a una operación protegida. |
| Sprint 1: edición del perfil autenticado | User Stories 3-4; FR-014 a FR-023 | La edición válida se confirma y todo acceso ajeno se rechaza. |
| Sprint 1: validación de autenticación | User Stories 2 y 4; FR-009 a FR-013 | Una identidad válida continúa; una autenticación ausente o inválida es denegada. |

El criterio de Sprint 1 relativo a la ejecución reproducible del entorno corresponde a la
planificación y verificación técnica. Se mantiene como obligación del proyecto, pero no define
comportamiento funcional dentro de esta especificación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al menos el 95% de los participantes de una prueba de usabilidad puede completar
  el registro y el primer inicio de sesión en menos de 3 minutos sin asistencia.
- **SC-002**: El 100% de los escenarios de aceptación con datos válidos permite completar el
  registro, inicio de sesión, renovación o edición esperados.
- **SC-003**: El 100% de las pruebas con credenciales, sesiones o refresh tokens inválidos
  deniega el acceso o la renovación sin modificar datos de usuario.
- **SC-004**: El 100% de los intentos de modificar el perfil de otra identidad o cambiar el rol
  desde el perfil es rechazado y deja la información objetivo intacta.
- **SC-005**: Al menos el 95% de las actualizaciones válidas de perfil muestra confirmación al
  usuario en menos de 5 segundos bajo las condiciones acordadas para las pruebas de aceptación.
- **SC-006**: Al menos el 90% de los participantes de una prueba de usabilidad identifica sin
  asistencia qué campo debe corregir después de un registro o una actualización inválida.
- **SC-007**: El 100% de los criterios funcionales de RQ-01, RQ-02 y Sprint 1 incluidos en esta
  feature tiene al menos un escenario de aceptación y un requisito funcional trazable.

**Measurement protocol**: SC-001 y SC-006 se evalúan en una única prueba moderada con 20
participantes adultos representativos, sin experiencia previa con StayHub: 10 ejecutan el flujo
como huésped y 10 como propietario; 10 reciben un registro inválido y 10 una actualización
inválida. Todos usan el mismo navegador, dispositivo, datos iniciales, guion e instrucciones y
no reciben ayuda tras iniciar. Todo intento iniciado cuenta. SC-001 aprueba con al menos 19/20
registros y primeros login completados en menos de 3 minutos; SC-006 con al menos 18/20 campos
incorrectos identificados sin pistas. SC-005 se mide desde el envío del perfil hasta la
confirmación visible en 20 actualizaciones válidas de navegador y aprueba con al menos 19/20 en
menos de 5 segundos. Se conserva consentimiento, guion, resultados agregados y evidencia
desidentificada, nunca credenciales, tokens ni datos personales.

## Assumptions

- El registro público permite solicitar los roles de huésped o propietario. El rol
  administrador solo puede existir aquí como cuenta previamente aprovisionada o fixture; el
  proceso que lo crea o cambia roles es una dependencia externa a esta feature.
- El correo es el identificador funcional utilizado durante el inicio de sesión.
- El teléfono, la foto y las preferencias pueden ser opcionales, mientras que nombre, correo y
  contraseña son obligatorios al registrar la cuenta.
- La recuperación de contraseña y la verificación de correo no forman parte del primer
  incremento descrito en `tendencias.md`.
