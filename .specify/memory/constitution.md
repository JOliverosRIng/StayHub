<!--
Sync Impact Report
- Version change: unversioned template -> 1.0.0
- Modified principles:
  - Placeholder Principle 1 -> I. Microservices Aligned to Business Domains
  - Placeholder Principle 2 -> II. Layered Architecture and Dependency Direction
  - Placeholder Principle 3 -> III. Independent Data Ownership
  - Placeholder Principle 4 -> IV. Explicit Synchronous and Asynchronous Communication
  - Placeholder Principle 5 -> V. Security by Default
- Added principles:
  - VI. Maintainable, Modular, and Typed Code
  - VII. Documented Service Contracts
  - VIII. Verification and Requirements Traceability
- Added sections:
  - Technical and Architectural Constraints
  - Development Workflow and Quality Gates
- Removed sections: None
- Follow-up TODOs: None
-->

# StayHub Constitution

## Core Principles

### I. Microservices Aligned to Business Domains

StayHub MUST be organized as decoupled microservices whose boundaries correspond to the
business domains defined by the project. Each service MUST have one clear responsibility,
own its business rules, and expose only explicit contracts. A service MUST NOT absorb
unrelated responsibilities merely to reduce the number of deployable components. Changes
inside one domain MUST minimize their effect on other services and MUST preserve published
contracts unless a coordinated contract change is approved.

Rationale: domain ownership keeps the platform understandable and allows services to evolve,
deploy, and scale independently.

### II. Layered Architecture and Dependency Direction

Every microservice MUST separate domain logic, application use cases, and infrastructure
concerns. Domain rules MUST remain independent of transport, persistence, messaging, and
framework-specific adapters. The application layer MUST coordinate use cases through domain
interfaces. Infrastructure implementations MUST depend on those interfaces and MUST NOT
become the source of business policy. Controllers, message consumers, and persistence adapters
MUST translate external data without embedding domain decisions.

Rationale: explicit dependency direction protects business behavior from technology changes
and makes the core rules testable in isolation.

### III. Independent Data Ownership

Each microservice MUST own its persistence model and database. A service MUST NOT read or
write another service's database directly, share mutable tables, or depend on another
service's internal schema. Cross-domain information MUST be obtained through a published
service contract or an event. Data duplication across services is permitted only when its
owner, synchronization mechanism, and consistency expectations are documented.

Rationale: independent data ownership prevents hidden coupling and preserves autonomous
deployment and scaling.

### IV. Explicit Synchronous and Asynchronous Communication

Synchronous request-response operations MUST use documented REST contracts. Domain events
and workflows that do not require an immediate response MUST use RabbitMQ. Events MUST state
their producer, consumers, payload schema, versioning expectations, retry behavior, and
failure handling. REST calls and event consumers MUST enforce timeouts, handle unavailable
dependencies, and avoid silent data loss. A workflow MUST NOT use an asynchronous event when
the caller requires an immediate authoritative result, or a synchronous dependency when an
event adequately expresses the business fact.

Rationale: consistent communication patterns make distributed behavior observable and reduce
temporal coupling.

### V. Security by Default

Protected operations MUST require validated JWT authentication and authorization based on the
roles defined by the project. Every external input MUST be validated and sanitized before it
reaches domain logic or persistence. Services MUST apply least privilege, prevent unauthorized
cross-user and cross-role access, and avoid exposing secrets or sensitive personal information
through responses, events, or logs. The API gateway MUST provide HTTPS at the platform edge.
Security failures MUST be covered by automated tests for affected use cases.

Rationale: identity, authorization, and input protection are system-wide invariants rather
than optional feature work.

### VI. Maintainable, Modular, and Typed Code

Application code MUST use TypeScript with strict, explicit types at public boundaries.
Modules MUST have cohesive responsibilities, descriptive names, and minimal coupling.
Business rules MUST exist in one authoritative location and MUST NOT be duplicated across
controllers, user interfaces, or services. New abstractions MUST solve a demonstrated need;
unnecessary generalization and framework leakage into the domain are prohibited. Changes MUST
include concise documentation when their intent cannot be understood from the code and
contracts alone.

Rationale: a modular and typed codebase supports safe collaboration across the project's
frontend and backend teams.

### VII. Documented Service Contracts

Every REST API exposed by a microservice MUST be documented with OpenAPI/Swagger and kept in
sync with its implemented behavior. Documentation MUST describe request and response schemas,
authentication and role requirements, relevant error responses, and externally visible
constraints. Contract changes MUST be reviewed for compatibility and communicated to affected
consumers before integration. RabbitMQ event schemas and routing semantics MUST be documented
with the same level of care, even though they are not represented as REST endpoints.

Rationale: contracts are the primary coordination mechanism between independently developed
services.

### VIII. Verification and Requirements Traceability

Every change MUST trace to an existing project requirement, acceptance criterion, defect, or
approved technical enabler. Implementation MUST satisfy the applicable acceptance criteria
without adding unapproved product behavior. Domain rules MUST have unit tests; service
boundaries, persistence adapters, REST contracts, and event flows MUST have integration tests
when they participate in the change; complete user journeys and critical cross-service flows
MUST have end-to-end tests. Tests MUST verify failure, authorization, validation, and relevant
concurrency cases as well as the successful path.

Rationale: traceability prevents scope drift, while tests provide evidence that distributed
behavior meets the agreed requirements.

## Technical and Architectural Constraints

- The backend MUST use NestJS with TypeScript, and the web client MUST use React with
  TypeScript, as established in the project plan.
- The complete development stack MUST start reproducibly through Docker Compose on a machine
  with Docker installed. Required services, dependencies, health checks, configuration inputs,
  and startup order MUST be represented or documented.
- Critical services MUST have an explicit restart policy consistent with the availability
  requirements in the project plan.
- PostgreSQL is the relational persistence technology, Redis is available for the caching
  responsibilities defined by the project, and RabbitMQ is the asynchronous message broker.
- Choices presented as alternatives in the project documentation, including TypeORM versus
  Prisma and Nginx versus Kong, MUST remain open until technical planning evaluates and records
  the decision. This constitution MUST NOT be used to select between those alternatives.
- Performance, availability, security, maintainability, portability, and communication
  requirements stated in `tendencias.md` are binding quality constraints. A feature plan MUST
  identify the subset it affects and define how compliance will be verified.

## Development Workflow and Quality Gates

1. A specification MUST identify the source requirements and acceptance criteria from
   `tendencias.md`. If proposed behavior is absent from that source, it requires explicit
   product approval before it enters the implementation plan.
2. A technical plan MUST identify service boundaries, layer responsibilities, data ownership,
   REST contracts, events, security rules, and applicable quality constraints before coding.
3. Implementation MUST include the tests required by Principle VIII. The project's Definition
   of Done requires unit-test coverage of at least 70% for the affected codebase; coverage does
   not replace meaningful behavior and integration tests.
4. Every REST contract affected by a change MUST have corresponding OpenAPI/Swagger
   documentation updated in the same change.
5. The affected services and frontend MUST build and run through Docker Compose. Cross-service
   changes MUST be verified in the composed environment before completion.
6. Code MUST pass the continuous-integration pipeline and receive review from at least one
   other team member before it is considered complete.
7. Reviewers MUST verify constitutional compliance, traceability to acceptance criteria, and
   the absence of unauthorized functional scope. Any justified exception MUST be documented in
   the plan or review record with an owner and a resolution path.

## Governance

This constitution is the highest-level development policy for StayHub. Specifications, plans,
tasks, implementation decisions, and reviews MUST comply with it. `tendencias.md` remains the
authoritative source for product scope and functional requirements; this constitution governs
how that scope is designed, implemented, verified, and operated without creating new product
requirements.

Amendments require a documented proposal describing the rule being changed, the reason, the
effect on existing work, and any migration required. An amendment MUST be reviewed and accepted
by the project team before dependent work adopts it. The amendment MUST update the version and
last-amended date in this document.

Constitution versions follow semantic versioning:

- MAJOR for removal or incompatible redefinition of an existing principle or governance rule.
- MINOR for a new principle or materially expanded mandatory guidance.
- PATCH for clarifications and wording changes that do not alter obligations.

Each feature specification and technical plan MUST include a constitution check. Each pull
request review MUST confirm applicable quality gates. Non-compliance blocks completion unless
an amendment is approved or a time-bounded exception is documented with its rationale, owner,
and corrective action.

**Version**: 1.0.0 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-09-25
