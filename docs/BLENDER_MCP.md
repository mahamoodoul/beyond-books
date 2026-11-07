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

Builds share `EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY`; prompt drafts allow 4× that.

## Safety and limits

- **Dev only.** The MCP tool runs arbitrary Python inside Blender, the add-on socket has no
  authentication, and the backend must run on the same machine to read the exported file. The
  provider is `production_ready=False`: it cannot be the default or be picked per request in
  staging/production.
- Builds run one at a time (one Blender). The build state lives in the backend process; if the
  backend restarts mid-build the job fails with "please generate again".
- Telemetry of the MCP server is disabled (`DISABLE_TELEMETRY=true`).
- Generated models start as *pending review*; a teacher must approve them before use.
