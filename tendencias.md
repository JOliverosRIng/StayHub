Plan de Trabajo
Plataforma de Alojamientos y Hoteles
Arquitectura de Microservicios
Proyecto:  StayHub (nombre provisional)
Modalidad:  Desarrollo ágil — 4 Sprints
Seguimiento:  GitHub Projects
Inicio:  1 de septiembre de 2026
Entrega final:  28 de noviembre de 2026
Duración:  13 semanas
Backend:  NestJS (TypeScript)
Frontend:  React (TypeScript)
## Integrantes
## Javier Alejandro Penagos Hernández
## Nicolás Felipe Corredor Cortés
## Daniel Fernando Romero Ochoa
## Janeth Oliveros Ramírez
## Juan David Palacios
## Juan Pablo Bustos Urueña
25 de septiembre de 2026

Plataforma de Alojamientos — Plan de Trabajo1
## Índice
## 1. Introducción2
1.1. Objetivo general  . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   2
1.2. Alcance  . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   2
## 2. Requerimientos2
2.1. Requerimientos funcionales . . . . . . . . . . . . . . . . . . . . . . . . . . .   2
2.2. Requerimientos no funcionales . . . . . . . . . . . . . . . . . . . . . . . . .   4
- Arquitectura del sistema4
3.1. Stack tecnológico . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   5
3.2. Microservicios . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   6
3.3. Infraestructura Docker . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   7
- Planificación por Sprints8
4.1. Resumen del cronograma . . . . . . . . . . . . . . . . . . . . . . . . . . . .   8
4.2. Sprint 1: Fundamentos e identidad  . . . . . . . . . . . . . . . . . . . . . .   9
4.3. Sprint 2: Alojamientos y búsqueda  . . . . . . . . . . . . . . . . . . . . . .  10
4.4. Sprint 3: Reservas, pagos y reseñas  . . . . . . . . . . . . . . . . . . . . . .  11
4.5. Sprint 4: Inventario, reportes, recomendaciones y cierre . . . . . . . . . . .  12
- Diagrama de Gantt14
- Riesgos y mitigación14
- Equipo de trabajo14
- Definición de Terminado (DoD)15

Plataforma de Alojamientos — Plan de Trabajo2
## 1  Introducción
StayHub es una plataforma de reservas de alojamientos y hoteles, inspirada en el
modelo de Airbnb y orientada al sector hotelero. El presente documento define el plan de
trabajo, los requerimientos funcionales y no funcionales, la arquitectura de microservicios
y la planificación por sprints para su desarrollo. El seguimiento del proyecto se realizará
a través de GitHub Projects, donde el equipo gestionará tareas, sprints y el estado de
los entregables.
1.1  Objetivo general
El objetivo del proyecto es construir una plataforma web que permita a propietarios
y administradores de hoteles tanto publicar como gestionar alojamientos, y a huéspedes
buscar, reservar, pagar y calificar propiedades, utilizando una arquitectura de microser-
vicios con NestJS en el backend y React en el frontend, desplegada con Docker.
## 1.2  Alcance
Al finalizar los cuatro sprints planificados, el producto mínimo viable (MVP) incluirá:
Registro, autenticación y gestión de perfiles de usuarios con roles (huésped, propietario,
administrador).
Publicación y administración de hoteles, habitaciones, fotos, precios y características.
Búsqueda avanzada con filtros y palabras clave.
Flujo completo de reservas: disponibilidad, confirmación, cancelación y check-in/out.
Procesamiento de pagos y reembolsos.
Sistema de reseñas y calificaciones.
Inventario de habitaciones y servicios del alojamiento.
Notificaciones y mensajería entre huésped y alojamiento.
Panel estadístico administrativo y recomendaciones personalizadas.
## 2  Requerimientos
Este capítulo consolida las necesidades del sistema en requerimientos funcionales y
no funcionales. Cada requerimiento funcional se identifica con un código único (RQ-XX)
para facilitar su trazabilidad durante el desarrollo y las pruebas.
2.1  Requerimientos funcionales
Los requerimientos funcionales describen las capacidades que el sistema debe ofrecer
a sus usuarios: huéspedes, propietarios y administradores. A continuación se detallan los
trece requerimientos priorizados para el MVP.

Plataforma de Alojamientos — Plan de Trabajo3
ID   NombreDescripción
RQ-01  Edición  del  perfil
de usuario
El usuario autenticado puede actualizar su nom-
bre, correo, teléfono, foto de perfil y preferen-
cias. El servicio de Usuarios valida los datos y
persiste los cambios.
RQ-02  Crear usuarioEl sistema permite registrar nuevos usuarios con
datos básicos (nombre, correo y contraseña) y
asignar un rol (huésped, propietario o adminis-
trador). Los servicios de Autenticación y Usua-
rios validan la información, cifran la contraseña
y persisten el registro.
RQ-03  Editar propiedadEl propietario puede modificar nombre, descrip-
ción, ubicación, precios, características, fotos y
disponibilidad de sus alojamientos publicados.
RQ-04  Buscar propiedad    El  huésped  puede buscar  alojamientos  por
ubicación, rango de precios, fechas de entra-
da/salida, capacidad, amenidades y palabras
clave. Los resultados se ordenan por relevancia.
RQ-05  Publicar propiedad  El propietario registrado puede crear y publicar
un nuevo alojamiento con habitaciones, fotos,
precios y características. La propiedad queda vi-
sible tras validación básica.
RQ-06  Ver detalles de una
propiedad
Cualquier usuario puede consultar la ficha com-
pleta de un alojamiento: fotos, descripción, pre-
cio, disponibilidad, reseñas y mapa de ubica-
ción.
RQ-07  Reservar una pro-
piedad
El huésped autenticado selecciona fechas, habi-
tación y confirma la reserva. El sistema verifica
disponibilidad, calcula el total y genera la orden
de pago.
RQ-08  Histórico de reser-
vas de mis propie-
dades
El propietario accede a un listado de todas las
reservas recibidas en sus propiedades, con filtros
por fecha, estado y huésped.
RQ-09  Cancelar   reserva
## (huésped)
El huésped puede cancelar una reserva activa
dentro de la política de cancelación. Se libera la
disponibilidad y se inicia el reembolso si aplica.
RQ-10  Cancelar   reserva
## (propietario)
El propietario puede cancelar una reserva con
justificación. Se notifica al huésped y se procesa
el reembolso completo.
RQ-11  Calificar la propie-
dad
Tras completar una estadía, el huésped puede
dejar una calificación (1–5 estrellas) y un co-
mentario sobre la propiedad.
RQ-12  Panel   estadístico
administrativo
El propietario/administrador visualiza métricas
de reservas, ingresos, tasa de ocupación, cance-
laciones y tendencias en un dashboard.

Plataforma de Alojamientos — Plan de Trabajo4
ID   NombreDescripción
RQ-13  Recomendaciones
de propiedades
El sistema sugiere alojamientos al huésped se-
gún su historial de búsquedas, reservas previas,
ubicaciones favoritas y propiedades similares.
2.2  Requerimientos no funcionales
Los requerimientos no funcionales establecen las condiciones de calidad bajo las cuales
el sistema debe operar. Definen estándares de rendimiento, seguridad, mantenibilidad y
portabilidad que aplican a todos los microservicios.
CategoríaDescripción
RendimientoTiempo de respuesta< 500 ms en el 95 % de las peticio-
nes de búsqueda y consulta.
EscalabilidadCada microservicio puede escalarse de forma indepen-
diente mediante réplicas Docker.
DisponibilidadLos servicios críticos (auth, bookings, payments) deben
reiniciarse automáticamente con restart: always.
SeguridadAutenticación JWT, HTTPS en gateway, validación de
roles y sanitización de entradas.
MantenibilidadCódigo modular en TypeScript (NestJS + React), do-
cumentación OpenAPI por servicio, logs centralizados.
PortabilidadTodo el stack corre con docker compose up en cual-
quier máquina con Docker instalado.
ComunicaciónREST para operaciones síncronas; RabbitMQ para
eventos (reserva creada, pago confirmado, etc.).
Cuadro 2: Requerimientos no funcionales
3  Arquitectura del sistema
La arquitectura se fundamenta en el desacoplamiento de responsabilidades, permi-
tiendo que cada componente evolucione, despliegue y escale de forma independiente. La
plataforma adopta una arquitectura de microservicios desacoplados, donde cada dominio
de negocio es un servicio independiente desarrollado con NestJS y su propia base de
datos. El cliente web es una aplicación React (SPA) que consume las APIs a través de
un API Gateway. Los servicios se comunican mediante API REST (síncrona) y eventos
de mensajería (asíncrona) a través de un Message Broker.

Plataforma de Alojamientos — Plan de Trabajo5
React (SPA)
API Gateway
AutenticaciónUsuariosAlojamientosBúsqueda
ReservasPagosReseñasRecomendaciones
Inv. Hab.NotificacionesMensajeríaReportes
Capa de microservicios (NestJS)
Docker ComposeRabbitMQ
PostgreSQL / Redis
Figura 1: Diagrama de arquitectura de la plataforma StayHub
3.1  Stack tecnológico
La selección de tecnologías busca unificar el lenguaje de programación (TypeScript),
facilitar el desarrollo en equipo y garantizar la portabilidad del sistema mediante conte-
nedores Docker.
Cuadro 3: Stack tecnológico de la plataforma
CapaTecnologíaUso en el proyecto
FrontendReact 18 + TypeScriptInterfaz de usuario: búsqueda, reservas,
panel del propietario, dashboard y mensa-
jería.
ViteBundler y entorno de desarrollo del fron-
tend.
React RouterNavegación entre vistas (públicas, huésped,
propietario, admin).
Axios / React QueryConsumo de APIs REST y gestión de esta-
do del servidor.
BackendNestJS 10 + TypeScript    Implementación de los 12 microservicios
con módulos, controladores y servicios.
TypeORM / PrismaORM para persistencia en PostgreSQL por
servicio.
Passport + JWTAutenticación y autorización en
auth-service.
@nestjs/microservices   Comunicación asíncrona con RabbitMQ
entre servicios.
## Swagger
## (@nestjs/swagger)
Documentación automática de APIs (Ope-
nAPI).

Plataforma de Alojamientos — Plan de Trabajo6
CapaTecnologíaUso en el proyecto
InfraestructuraDocker + Docker Compo-
se
Contenedorización y orquestación de todos
los servicios.
PostgreSQL 16Base de datos relacional (una instancia por
microservicio).
Redis 7Caché de sesiones, búsquedas fre-
cuentes y resultados de consulta en
search-service.
RabbitMQ 3Message broker para eventos (reserva crea-
da, pago confirmado, etc.).
Nginx / KongAPI Gateway: enrutamiento, SSL y balan-
ceo de carga.
## 3.2  Microservicios
Cada microservicio representa un dominio de negocio con responsabilidades bien de-
finidas, su propia base de datos y endpoints REST documentados. La tabla siguiente
resume los doce servicios que componen la plataforma.
ServicioResponsabilidadEndpoints principales
auth-serviceAutenticación, emisión y
validación de JWT, permi-
sos y seguridad.
POST /auth/login
POST /auth/register
POST /auth/refresh
GET /auth/validate
users-serviceRegistro de usuarios, perfi-
les, roles (huésped, propie-
tario, admin) y edición de
datos personales.
GET /users/:id
PUT /users/:id
GET /users/:id/profile
PUT /users/:id/profile
accommodations-
service
Gestión de hoteles, habi-
taciones, fotos, precios, ca-
racterísticas y publicación
de propiedades.
POST /properties
PUT /properties/:id
GET /properties/:id
POST /properties/:id/photos
search-serviceBúsqueda de alojamientos
por ubicación, precio, fe-
chas, capacidad, keywords
y filtros combinados.
GET /search
GET /search/suggest
bookings-serviceDisponibilidad, creación
de reservas, cancelaciones
(huésped y propietario),
check-in/out e historial.
POST /bookings
GET /bookings/:id
DELETE /bookings/:id
GET /bookings/history
payments-serviceProcesamiento de pagos,
reembolsos y consulta de
estados de transacciones.
POST /payments
POST /payments/:id/refund
GET /payments/:id/status

Plataforma de Alojamientos — Plan de Trabajo7
ServicioResponsabilidadEndpoints principales
reviews-serviceCalificaciones y comen-
tarios de huéspedes sobre
propiedades visitadas.
POST /reviews
GET /properties/:id/reviews
GET /reviews/user/:id
room-inventory-
service
Control de productos y ser-
vicios disponibles en cada
habitación o alojamiento.
GET /inventory/rooms/:id
PUT /inventory/rooms/:id
POST /inventory/rooms/:id/items
notifications-service  Confirmaciones de reserva,
recordatorios de check-in y
alertas del sistema.
POST /notifications/send
GET /notifications/user/:id
messaging-serviceComunicación en tiem-
po real o asíncrona entre
huésped y propietario o
alojamiento.
POST /messages
GET /conversations/:id
GET /messages/:conversationId
reports-servicePanel estadístico: reser-
vas, ingresos, ocupación,
tendencias y métricas por
propietario.
GET /reports/owner/:id
GET /reports/occupancy
GET /reports/revenue
recommendations-
service
Recomendaciones de pro-
piedades según historial,
preferencias y comporta-
miento del cliente.
GET /recommendations/user/:id
GET /recommendations/similar/:propertyId
## 3.3  Infraestructura Docker
La contenedorización permite que todo el ecosistema de la aplicación se levante de
forma reproducible en cualquier entorno de desarrollo con un único comando. Cada mi-
croservicio NestJS y la aplicación React se empaquetan en contenedores Docker indepen-
dientes. Un archivo docker-compose.yml orquesta todos los servicios, bases de datos y
componentes de infraestructura.

Plataforma de Alojamientos — Plan de Trabajo8
Cuadro 5: Componentes de infraestructura Docker
ContenedorImagen / Tecnología  Puerto
web (frontend)React + Vite (Node 20)  5173
API GatewayNestJS / Nginx8080
auth-serviceNestJS3001
users-serviceNestJS3002
accommodations-service    NestJS3003
search-serviceNestJS3004
bookings-serviceNestJS3005
payments-serviceNestJS3006
reviews-serviceNestJS3007
room-inventory-serviceNestJS3008
notifications-serviceNestJS3009
messaging-serviceNestJS + Socket.io3010
reports-serviceNestJS3011
recommendations-service   NestJS3012
PostgreSQL (por servicio)  postgres:165432–5445
## Redisredis:76379
RabbitMQrabbitmq:3-management  5672 / 15672
Cada servicio NestJS escucha activamente en su puerto asignado y responde a las
peticiones del API Gateway o de otros servicios según la necesidad del flujo de negocio.
El frontend React se sirve en desarrollo con Vite y en producción como build estático
detrás de Nginx.
4  Planificación por Sprints
El desarrollo se organiza en cuatro sprints de tres semanas con entregables incremen-
tales, desde la infraestructura base hasta la integración completa de la plataforma. Cada
sprint tiene un objetivo claro, tareas estimadas y criterios de aceptación definidos. El
avance de las tareas y entregables se dará seguimiento en GitHub Projects.
4.1  Resumen del cronograma
El proyecto contempla doce semanas de desarrollo distribuidas en cuatro sprints de
tres semanas, seguidas de un período de cierre y entrega final el 28 de noviembre de 2026.
La siguiente tabla resume las fechas de inicio y fin de cada sprint.
Sprint  NombreInicioFin
Sprint 1  Fundamentos e identidad01 Sep 2026  21 Sep 2026
Sprint 2  Alojamientos y búsqueda22 Sep 2026  12 Oct 2026
Sprint 3  Reservas, pagos y reseñas13 Oct 2026  02 Nov 2026
Sprint 4  Inventario, reportes y cierre  03 Nov 2026  23 Nov 2026
Entrega final (cierre): 24 – 28 de noviembre de 2026
Cuadro 6: Cronograma de los 4 sprints

Plataforma de Alojamientos — Plan de Trabajo9
4.2  Sprint 1: Fundamentos e identidad
El primer sprint sienta las bases técnicas del proyecto. Se configura el entorno de
desarrollo, la infraestructura Docker y los servicios esenciales de autenticación y gestión
de usuarios.
Duración: 3 semanas (01 – 21 de septiembre de 2026)
Objetivo: Establecer la infraestructura base con Docker, el monorepo NestJS + React,
implementar autenticación, gestión de usuarios y edición de perfiles.
## Entregables:
Monorepo con estructura apps/ (microservicios NestJS + frontend React con Vite).
docker-compose.yml con servicios base, PostgreSQL y RabbitMQ.
API Gateway NestJS configurado y enrutando peticiones.
auth-service
(NestJS): registro, login, refresh token, validación JWT con Passport.
users-service
(NestJS): CRUD de usuarios, perfiles y roles.
Frontend React: layout base, rutas, pantallas de login, registro y edición de perfil.
Implementación de RQ-01 (Edición del perfil de usuario) y RQ-02 (Crear usuario).
TareaEst. (h)Resp.Servicio
Configurar monorepo NestJS +
React (Vite)
6DevOps—
Scaffold frontend React (routing,
layout)
8Frontendweb
Diseñar esquema de BD usua-
rios/auth
4Backendauth, users
Implementar auth-service NestJS
## (JWT)
16Backendauth
## Implementarusers-service
NestJS (perfil)
12Backendusers
Pantallas React: login, registro,
perfil
10Frontendweb
Configurar Docker Compose ini-
cial
8DevOpsinfra
Configurar API Gateway NestJS  8DevOpsgateway
Pruebas unitarias e integración
## Sprint 1
8QAtodos
Total estimado80
Cuadro 7: Tareas del Sprint 1
Criterios de aceptación:
Un usuario puede registrarse e iniciar sesión desde la interfaz React.

Plataforma de Alojamientos — Plan de Trabajo10
El usuario autenticado puede editar su perfil desde React consumiendo users-service.
Los tokens JWT se validan correctamente en rutas protegidas de NestJS.
Todos los servicios del sprint levantan con docker compose up.
4.3  Sprint 2: Alojamientos y búsqueda
En este sprint se habilita el ciclo de vida de las propiedades: publicación, actualización,
consulta y búsqueda. Es el primer contacto del huésped con el catálogo de alojamientos
disponibles.
Duración: 3 semanas (22 de septiembre – 12 de octubre de 2026)
Objetivo: Permitir la publicación, actualización y consulta de propiedades, junto con
un motor de búsqueda con filtros.
## Entregables:
accommodations-service
(NestJS): hoteles, habitaciones, fotos, precios, características.
search-service
(NestJS): búsqueda por ubicación, precio, fechas, capacidad y keywords mediante con-
sultas en PostgreSQL.
Frontend React: búsqueda con filtros, listado de resultados, detalle de propiedad y
formulario de publicación.
Implementación de RQ-03, RQ-04, RQ-05 y RQ-06.
TareaEst. (h)Resp.Servicio
Modelar entidades: hotel, habita-
ción, foto
6Backendaccommodations
Implementar CRUD propiedades
(NestJS)
16Backendaccommodations
Subida y almacenamiento de fo-
tos
8Backendaccommodations
Implementar búsqueda con filtros
(PostgreSQL)
12Backendsearch
Implementar keywords y caché
(Redis)
8Backendsearch
Vista React: búsqueda y resulta-
dos
10Frontendweb
Vista React: detalle y publicar
propiedad
12Frontendweb
Pruebas e integración Sprint 210QAtodos
Total estimado82
Cuadro 8: Tareas del Sprint 2
Criterios de aceptación:
Un propietario puede publicar y actualizar una propiedad con fotos.

Plataforma de Alojamientos — Plan de Trabajo11
Un huésped puede buscar propiedades con múltiples filtros y ver el detalle completo.
Los resultados de búsqueda responden en menos de 500 ms.
4.4  Sprint 3: Reservas, pagos y reseñas
Este sprint implementa el flujo de negocio central de la plataforma: reservar un aloja-
miento, procesar el pago, gestionar cancelaciones y permitir que los huéspedes califiquen
su experiencia.
Duración: 3 semanas (13 de octubre – 02 de noviembre de 2026)
Objetivo: Implementar el flujo completo de reservas con pagos, cancelaciones, histo-
rial y sistema de calificaciones.
## Entregables:
bookings-service
(NestJS): disponibilidad, reservas, cancelaciones, check-in/out.
payments-service
(NestJS): procesamiento de pagos, reembolsos y estados.
reviews-service
(NestJS): calificaciones y comentarios.
notifications-service
(NestJS): confirmaciones y alertas de reserva.
Frontend React: flujo de reserva, historial, cancelaciones y formulario de reseñas.
Implementación de RQ-07, RQ-08, RQ-09, RQ-10 y RQ-11.

Plataforma de Alojamientos — Plan de Trabajo12
TareaEst. (h)Resp.Servicio
Lógica de disponibilidad y reser-
vas (NestJS)
16Backendbookings
Cancelación huésped y propieta-
rio
10Backendbookings
Historial de reservas del propie-
tario
6Backendbookings
Integración mock de pasarela de
pago
12Backendpayments
Flujo de reembolsos8Backendpayments
Sistema de reseñas y calificacio-
nes
10Backendreviews
## Notificacionesdereserva
## (email/eventos)
8Backendnotifications
Eventos  asíncronos  con  Rab-
bitMQ (@nestjs)
8Backendtodos
Vistas React: reservar, historial,
cancelar
14Frontendweb
Vista React: calificar propiedad   6Frontendweb
Pruebas end-to-end del flujo de
reserva
12QAtodos
Total estimado110
Cuadro 9: Tareas del Sprint 3
Criterios de aceptación:
Un huésped puede reservar, pagar y recibir confirmación.
Huésped y propietario pueden cancelar reservas según las políticas definidas.
El propietario ve el historial de reservas de sus propiedades.
Tras la estadía, el huésped puede calificar la propiedad.
4.5  Sprint 4: Inventario, reportes, recomendaciones y cierre
El último sprint completa las funcionalidades complementarias y prepara la entrega
final. Se integran inventario de habitaciones, mensajería, reportes, recomendaciones y se
realizan las pruebas de cierre del proyecto.
Duración: 3 semanas (03 – 23 de noviembre de 2026). Entrega final: 28 de noviembre
de 2026.
Objetivo: Completar los servicios de inventario de habitaciones, mensajería, reportes,
recomendaciones y realizar pruebas integrales de la plataforma.
## Entregables:
room-inventory-service
(NestJS).
messaging-service
(NestJS + Socket.io): chat huésped–propietario.

Plataforma de Alojamientos — Plan de Trabajo13
reports-service
(NestJS): dashboard estadístico.
recommendations-service
(NestJS): sugerencias personalizadas.
Frontend React: panel administrativo, inventario de habitaciones, mensajería y reco-
mendaciones.
Implementación de RQ-12 y RQ-13.
Pruebas de integración, documentación final y demo.
TareaEst. (h)Resp.Servicio
Inventario    de    habitaciones
(NestJS)
10Backendroom-inventory
Mensajería   con   WebSockets
(NestJS Gateway)
14Backendmessaging
Dashboard de reportes (NestJS)   16Backendreports
Motor de recomendaciones básico  12Backendrecommendations
Panel React: estadísticas y gráfi-
cos
14Frontendweb
Vistas React: inventario y men-
sajería
12Frontendweb
Vista  React:  recomendaciones
personalizadas
8Frontendweb
Pruebas de carga y estrés básicas  8QAinfra
Documentación API (Swagger en
NestJS)
8Todostodos
Corrección de bugs y refinamien-
to
12Todostodos
Preparación de demo y entrega fi-
nal
6Todos—
Total estimado120
Cuadro 10: Tareas del Sprint 4
Criterios de aceptación:
El propietario visualiza estadísticas de ocupación e ingresos en el panel.
El huésped recibe recomendaciones personalizadas de propiedades.
El inventario de habitaciones se actualiza correctamente.
La plataforma completa funciona con docker compose up sin errores.
Documentación entregada y demo funcional realizada.

Plataforma de Alojamientos — Plan de Trabajo14
5  Diagrama de Gantt
El diagrama de Gantt ofrece una visión temporal del proyecto, mostrando la distribu-
ción de los cuatro sprints de tres semanas y el período de cierre hasta la entrega final.
## Sprint / Hito
## S1  S2  S3  S4  S5  S6  S7  S8  S9  S10  S11  S12  S13
## Sprint 1: Fundamentos
## Sprint 2: Alojamientos
Sprint 3: Reservas/Pagos
## Sprint 4: Cierre
Entrega final
Sep 2026Oct 2026Nov 2026
6  Riesgos y mitigación
La identificación temprana de riesgos permite anticipar problemas que podrían afectar
el cronograma o la calidad del producto. A continuación se presentan los principales riesgos
del proyecto junto con sus estrategias de mitigación.
RiesgoProb.   Impacto Mitigación
Complejidad de inte-
gración entre 12 servi-
cios
AltaAltoAPI Gateway centralizado, contratos
OpenAPI, pruebas de integración con-
tinuas.
Retrasos en Sprint 3
(flujo de reservas)
Media    AltoPriorizar MVP del flujo de reserva; pos-
poner check-in/out avanzado si es nece-
sario.
Problemas  de  rendi-
miento en búsqueda
Media    Medio    Índices en PostgreSQL, caché con Re-
dis.
Falta  de  experiencia
con Docker
BajaMedio    Sprint 1 dedicado a infraestructura; do-
cumentar setup paso a paso.
Scope creep en inven-
tario de habitaciones
Media    Medio    Definir MVP mínimo; funcionalidades
avanzadas quedan para fase 2.
Cuadro 11: Matriz de riesgos
7  Equipo de trabajo
El éxito del proyecto depende de la distribución clara de roles y responsabilidades. El
equipo está conformado por seis integrantes con perfiles de backend, frontend, fullstack y
aseguramiento de calidad.

Plataforma de Alojamientos — Plan de Trabajo15
Cuadro 12: Composición del equipo
ÁreaIntegrantesResponsabilidades
## Backend
Javier Alejandro Penagos Hernández,
Juan Pablo Bustos Urueña, Juan David Palacios (apoyo)
- Microservicios NestJS, TypeORM/Prisma,
RabbitMQ, API Gateway y lógica de nego-
cio.
## Frontend
Nicolás Felipe Corredor Cortés, Janeth Oliveros Ramírez
Juan David Palacios (apoyo)
SPA React con Vite, React Router, consumo
de APIs, dashboards y vistas de usuario.
QADaniel Fernando Romero Ochoa
- Pruebas unitarias, de integración y end-to-end;
validación de criterios de aceptación.
8  Definición de Terminado (DoD)
La Definición de Terminado establece los criterios mínimos que debe cumplir cual-
quier ítem del backlog para considerarse completado. Estos estándares aplican de forma
uniforme a todo el equipo durante los cuatro sprints.
Un ítem del backlog se considera terminado cuando:
- El código está en la rama principal (main) y pasa el pipeline de CI.
- Existen pruebas unitarias con cobertura mínima del 70 % (Jest en NestJS y React).
- La API NestJS está documentada con Swagger/OpenAPI.
- El servicio corre en Docker sin errores; el frontend React compila sin warnings críticos.
- Ha sido revisado por al menos otro miembro del equipo (code review).
- Los criterios de aceptación del requerimiento asociado se cumplen.