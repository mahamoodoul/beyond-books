# ADR 0006: LLM access through an adapter; OpenAI first, deterministic fake for dev/tests

- **Status:** Proposed — interim answer to open decision #3 (LLM)
- **Date:** 2026-11-07

## Decision

- All model calls go through `LLMProvider.generate_structured` (`app/integrations/interfaces.py`).
- `OpenAIProvider` (`app/integrations/openai/provider.py`) uses the Responses API with structured
  outputs, `store=False`, SDK retries disabled (our job runner owns retries/backoff).
- No model name is hard-coded: `EDU3D_OPENAI_MODEL` must be set explicitly, together with
  `EDU3D_OPENAI_API_KEY`, when `EDU3D_LLM_PROVIDER=openai`.
- `FakeLLMProvider` (default) builds deterministic, correctly grounded output from the source
  passages so the whole workflow runs locally and in CI without a key or spend. It says nothing
  about prompt quality.
- Cost: token usage is always recorded; a monetary estimate is recorded only if
  `EDU3D_LLM_INPUT_PRICE_PER_MTOK` / `..._OUTPUT_...` are configured. We never guess prices.
- Per-course daily cap on AI jobs (`EDU3D_AI_MAX_JOBS_PER_COURSE_PER_DAY`, default 40).
- Student personal data is never sent to the model by Phase 3 workflows (only document text,
  chapter titles/objectives and teacher instructions).

## Before choosing the real model

Confirm structured-output support for the exact model, data-retention controls, regional/DPA
terms for Norwegian/EU schools, and current pricing.

## Update (2026-11-07): Claude adapter

`AnthropicProvider` (`app/integrations/anthropic/provider.py`) was added and is the team's chosen
provider (`EDU3D_LLM_PROVIDER=anthropic`, default model `claude-opus-5-5`):
- `client.beta.messages.parse(output_format=<Pydantic schema>)` for validated structured output.
- Adaptive thinking is always on for Claude Opus 5.5; depth is set via `output_config.effort`
  (`EDU3D_ANTHROPIC_EFFORT`, default `medium` — raise to `high` if lesson quality needs it).
- Server-side refusal fallbacks enabled (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`); a final `refusal` or `max_tokens` stop fails the job cleanly.
- SDK retries disabled; the job runner retries transient errors (429, 5xx/529, timeouts).
The OpenAI adapter remains available.
