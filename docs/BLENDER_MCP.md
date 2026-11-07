# Blender MCP 3D provider

Teachers generate 3D models for the **3D library** by letting Claude build them in a real
Blender. Provider name: `blender` (`app/integrations/blender/provider.py`).

## Flow

1. **3D library → ✦ Generate with AI → topic.** The LLM writes an in-depth build brief
   (`POST /three-d/prompt-drafts`, prompt `three_d_prompt_draft`): purpose, form, a named part
   list with shapes, positions and colours, cutaways and accuracy notes. The teacher can edit it.
2. **Generate with "Claude + Blender".** `POST /assets/generation-jobs` with `provider: "blender"`:
   - the backend starts the Blender MCP server (`uvx mcp-for-blender`, stdio), which talks to the
     *MCP for Blender* add-on in your running Blender (`localhost:9876`);
   - a new empty scene `edu3d_<id>` is created, so your own scenes are not touched;
   - Claude (`claude-opus-5-5` by default, tool runner + the SDK's MCP helpers) builds the model
     with only `execute_blender_code`, `get_scene_info` and `look` (no asset downloads, no paid
     generators), following the `blender_build` system prompt;
   - the **server** exports that scene to GLB, reads the file and removes the scene;
   - the GLB goes through the normal pipeline: validation, storage, teacher review, library.
3. The job runs in the background (2–8 minutes is typical); the page shows progress. When it
   finishes the model appears in the library as *pending review*.

## One-time setup (macOS)

1. Blender 3.0+ (tested with 5.2) and [uv](https://docs.astral.sh/uv/): `brew install uv`.
2. Install the add-on: `uvx mcp-for-blender install-addon`
   (or Blender → Edit → Preferences → Add-ons → Install… → `addon.py`, then enable
   *Interface: MCP for Blender*).
3. Open Blender **with its window** (not `blender -b`). The add-on starts its server; check the
   3D View sidebar (`N`) → *MCP for Blender* tab and connect if needed.
4. `backend/.env`: `EDU3D_ANTHROPIC_API_KEY` set; optional `EDU3D_BLENDER_*` settings
   (see `.env.example`). Restart the backend.
5. In the app, choose **Claude + Blender (local Blender MCP)** as generator; the line under it
   should say "Blender is reachable" (`GET /three-d/provider-health?name=blender`).

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_BLENDER_MCP_COMMAND` | `uvx mcp-for-blender` | Command that starts the MCP server |
| `EDU3D_BLENDER_HOST` / `_PORT` | `localhost` / `9876` | Where the add-on listens |
| `EDU3D_BLENDER_MODEL` | (empty = `EDU3D_ANTHROPIC_MODEL`) | Claude model for the build |
| `EDU3D_BLENDER_MAX_TURNS` | `40` | Max Claude ↔ Blender round trips |
| `EDU3D_BLENDER_TIMEOUT_S` | `540` | Whole build; keep under the ~10 min job window |
| `EDU3D_THREE_D_EFFORT` | (empty = `EDU3D_ANTHROPIC_EFFORT`) | Reasoning effort for 3D builds only |
| `EDU3D_THREE_D_TUNING_ENABLED` | `true` | Prepend the model tuning prompt (below) |
| `EDU3D_THREE_D_TUNING_PROMPT_FILE` | (empty = built-in file) | Your own tuning prompt file |
| `EDU3D_THREE_D_TUNING_PROMPT` | (empty) | Inline tuning prompt; wins over the file |

Builds share `EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY`; prompt drafts allow 4× that.

## Model tuning (the quality prompt)

Every 3D build gets two prompts: the **model tuning** prompt, then the generator's **build
contract**. The tuning prompt is the quality bar: realistic geometry, PBR materials, one named
mesh per selectable part, internal structure and cross-sections, functional animations, metadata,
optimisation and validation. The contract is fixed in code (`blender_build` for Blender,
`three_d_model_design` for the three.js generator) and defines the tools, the workspace rules,
sizing and the exact JSON the server expects back; where the two disagree, the contract wins.

- **Default text:** [`backend/app/modules/ai_engine/tuning/three_d_model.md`](../backend/app/modules/ai_engine/tuning/three_d_model.md).
  Edit it and the next generation uses the new text; no restart is needed.
- **Your own file:** `EDU3D_THREE_D_TUNING_PROMPT_FILE=/path/to/prompt.md` (for Docker, mount the
  file into the `api` container and give the container path).
- **One-off inline text:** `EDU3D_THREE_D_TUNING_PROMPT="..."` (wins over the file).
- **Off:** `EDU3D_THREE_D_TUNING_ENABLED=false` keeps only the build contract.
- **Traceability:** the stored prompt version becomes `blender_build@1.0.0+tuning.<hash>` (same
  for `three_d_model_design`), so you can tell which tuning text produced which model.
- Both generators use the same tuning text. The three.js generator can only follow the parts of it
  that fit primitives and flat colours; Blender can follow nearly all of it (no image textures,
  no file or network access, and the server does the GLB export).

## Safety and limits

- **Dev only.** The MCP tool runs arbitrary Python inside Blender, the add-on socket has no
  authentication, and the backend must run on the same machine to read the exported file. The
  provider is `production_ready=False`: it cannot be the default or be picked per request in
  staging/production.
- Builds run one at a time (one Blender). The build state lives in the backend process; if the
  backend restarts mid-build the job fails with "please generate again".
- Telemetry of the MCP server is disabled (`DISABLE_TELEMETRY=true`).
- Generated models start as *pending review*; a teacher must approve them before use.
