# Adding or switching an AI provider (LLM or 3D)

All providers are registered in one place: `backend/app/integrations/providers.py`.
Business logic only talks to the interfaces in `backend/app/integrations/interfaces.py`, so a new
vendor never touches workflows, prompts, validation or the UI.

## Switch provider or model (no code)

Edit `backend/.env` (local) or your secret store (deployed), then restart the API and worker:

```env
EDU3D_LLM_PROVIDER=anthropic            # fake | anthropic | openai
EDU3D_ANTHROPIC_MODEL=claude-opus-5-5   # any model id the vendor offers
EDU3D_THREE_D_PROVIDER=llm              # llm | blender | fake | tripo | meshy
```

Startup fails fast with a clear message if the name is unknown or a required key is missing
(e.g. `llm provider 'anthropic' requires EDU3D_ANTHROPIC_API_KEY`). Update
`EDU3D_LLM_INPUT_PRICE_PER_MTOK` / `..._OUTPUT_...` to the selected model's price for cost
estimates. Any OpenAI-compatible endpoint works with `EDU3D_LLM_PROVIDER=openai` plus
`EDU3D_OPENAI_BASE_URL`.

## Add a new LLM vendor (example: "acme")

1. **Adapter** — `backend/app/integrations/acme/provider.py` implementing `LLMProvider`:
   `name`, `model`, and `generate_structured(system_prompt, task, references, output_schema,
   prompt_version, max_output_tokens) -> StructuredResult`. Rules:
   - Build the user message with `render_input(task, references)` (keeps document text
     delimited as untrusted data).
   - Return a validated instance of `output_schema` (use the vendor's structured-output feature).
   - Map retryable failures (rate limit, 5xx, timeouts) to `ProviderTransientError`, everything
     else (refusal, truncation, 4xx) to `ProviderPermanentError`. Disable SDK retries — the job
     runner retries.
   - Report token usage in `LLMUsage`.
2. **Settings** — add fields to `Settings` in `backend/app/core/config.py`, e.g.
   `acme_api_key: str = ""`, `acme_model: str = ""` (env: `EDU3D_ACME_API_KEY`, ...).
3. **Register** — in `providers.py`:
   ```python
   def _acme(s):
       from app.integrations.acme.provider import AcmeProvider
       return AcmeProvider(s.acme_api_key, s.acme_model, s.llm_timeout_s)

   register(ProviderSpec("llm", "acme", "Acme LLM", ("acme_api_key", "acme_model"), _acme))
   ```
4. **Env files** — add the keys to `.env.example`, `.env.production.example` and your local
   `backend/.env` in the "AI PROVIDERS" block (and to `docker-compose.yml` passthrough).
5. **Tests** — copy `backend/tests/test_anthropic_provider.py`: stub the client, assert the
   request shape, error mapping, refusal/truncation handling. No real API calls in CI.

## The built-in "llm" 3D provider

`llm` asks the configured LLM (e.g. Claude) to design the model as named primitives (box, sphere,
ellipsoid, cylinder, cone, torus, capsule) with positions, rotations, colours and a student-facing
description per part. The output is clamped and validated, converted to GLB by
`backend/app/modules/three_d/mesh.py`, and stored like any vendor model (GLB checks, teacher
review). Part descriptions become scene explanations automatically. Teachers can choose the
generator per request in the UI; only configured providers are offered
(`GET /api/v1/three-d/providers`). Prompt: `THREE_D_MODEL_DESIGN` in
`backend/app/modules/ai_engine/prompts.py` (bump its version when you change it).

## The "blender" 3D provider (Claude + Blender MCP)

Claude builds the model inside your running Blender through Blender MCP; the server exports it
to GLB and stores it in the 3D library. Local/dev only. Setup: [BLENDER_MCP.md](BLENDER_MCP.md).

## Add a 3D generation vendor

Same steps with `ThreeDGenerationProvider` (`create_task`, `get_task`, `fetch_output`) and
`ProviderSpec("three_d", ...)`. The job runner already handles idempotent task creation (stored
`provider_task_id`), polling with backoff, GLB validation and review. Only implement an adapter
after verifying the vendor's current API, output format, commercial rights and pricing.
