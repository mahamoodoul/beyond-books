# ADR 0001: Modular monolith with asynchronous workers

- **Status:** Proposed
- **Date:** 2026-11-07
- **Deciders:** All four developers

## Context

Four developers, a 50–100 user pilot, and long-running PDF/AI/3D work (design §3, §4).

## Decision

One FastAPI application with isolated domain modules under `backend/app/modules`, one PostgreSQL
database, Redis + Celery workers for anything slow. External services sit behind the protocols in
`backend/app/integrations/interfaces.py`. No Kubernetes, Kafka or extra databases for the pilot.

## Consequences

- One deployable, one migration history, simple local setup.
- Module boundaries are enforced by convention and review, not the network — watch for cross-module
  imports of repositories.
- Candidate extractions later: document processing, AI orchestration, 3D generation, analytics.

## Alternatives considered

Microservices from day one — rejected for operational cost at this team size.
