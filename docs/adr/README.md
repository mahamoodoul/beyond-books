# Architecture Decision Records

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with asynchronous workers | Proposed |
| [0002](0002-async-job-lifecycle.md) | Shared asynchronous job lifecycle | Proposed |
| [0003](0003-declarative-scene-and-animation-contracts.md) | Declarative scene and animation contracts | Proposed |
| [0004](0004-identity-local-provider-behind-interface.md) | Local identity provider behind an interface (interim for #1) | Proposed |
| [0005](0005-tenant-model-teacher-owned-first.md) | Teacher-owned courses first (interim for #2) | Proposed |

Copy [0000-template.md](0000-template.md) for new decisions.

## Open decisions (design §22) — not yet decided

Each needs an ADR before the phase that depends on it.

| # | Decision | Blocks |
|---|---|---|
| 1 | Identity provider (Cognito or other) | Phase 1 |
| 2 | Tenant model: schools now, or teacher-owned courses first | Phase 1 |
| 3 | LLM model, structured-output support, data controls, pricing | Phase 3 |
| 4 | LangGraph vs a simpler orchestrator | Phase 3 |
| 5 | Tripo/Meshy capabilities, rights, pricing, webhooks | Phase 5 |
| 6 | Spline's role, if any | Phase 4 |
| 7 | Licensed, medically reviewed anatomy assets | Phase 11 (full-body anatomy) |
| 8 | Assessment policy: AI advisory only or contributes to scores | Phase 8 |
| 9 | Privacy: age group, retention, lawful basis, agreements | Before any pilot with students |
| 10 | Cloud region | Phase 10 |
| 11 | Pilot scope: one subject, one chapter | Phase 3 |
| 12 | Monthly budget limits (LLM, 3D, cloud, bandwidth) | Phase 3 |
