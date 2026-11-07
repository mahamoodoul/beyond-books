# ADR 0014: Pluggable provider registry for LLM and 3D generation

- **Status:** Proposed
- **Date:** 2026-11-07

## Decision

- `backend/app/integrations/providers.py` is the single registry of LLM and 3D providers. Each
  `ProviderSpec` declares its kind, name, required settings and a lazy factory.
- `EDU3D_LLM_PROVIDER` / `EDU3D_THREE_D_PROVIDER` are free strings validated against the registry
  at startup, together with the provider's required settings; fake providers are flagged
  `production_ready=False` and rejected in staging/production.
- Models are configuration (`EDU3D_<VENDOR>_MODEL`), never hard-coded in workflows.
- Built-ins: LLM `fake`, `anthropic` (Claude, default model `claude-opus-5-5`), `openai`
  (plus any OpenAI-compatible endpoint via `EDU3D_OPENAI_BASE_URL`); 3D `fake`, `tripo`, `meshy`
  (stubs until verified). Per-vendor keys: `EDU3D_ANTHROPIC_API_KEY`, `EDU3D_OPENAI_API_KEY`,
  `EDU3D_TRIPO_API_KEY`, `EDU3D_MESHY_API_KEY`.
- How to add one: `docs/ADDING_A_PROVIDER.md`.

## Consequences

New vendors are additive (adapter + settings + one `register` call). Per-task model routing
(e.g. a cheaper model for answer evaluation) can be added later as a registry concern without
changing workflows.

## Update: LLM-designed 3D models (three.js)

Added 3D provider `llm` (`app/integrations/three_d/llm_procedural.py`): the LLM returns a
validated parts description (no code), converted to GLB and handled by the same pipeline as
third-party vendors. Generation requests may name a provider (`provider` field); the UI lists
only configured providers. `llm` is the default 3D provider in local and production examples;
`tripo`/`meshy` remain selectable once their adapters are verified and keys are set.
