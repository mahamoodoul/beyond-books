"""3D provider "blender": Claude builds the model inside a running Blender through Blender MCP.

Flow (one build at a time, because there is one Blender):
1. The server starts the Blender MCP server (`mcp-for-blender`, stdio) which talks to the
   "MCP for Blender" add-on inside a running Blender (default localhost:9876).
2. A fresh, empty scene is created for the build, so the user's own scenes are never touched.
3. Claude (tool runner + the SDK's MCP helpers) builds the model with a small allowlist of
   Blender MCP tools: execute_blender_code, get_scene_info, look.
4. The SERVER (not Claude) exports that scene to GLB, reads the file and removes the scene.
5. The GLB then goes through the same pipeline as every 3D provider: validation, storage,
   teacher review, 3D library.

Local/dev only (production_ready=False in the registry): the MCP tools run arbitrary Python in
that Blender, and the backend must run on the same machine to read the exported file.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import shlex
import socket
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.integrations.interfaces import (
    LLMUsage,
    ProviderPermanentError,
    ProviderTaskStatus,
    ThreeDTask,
)
from app.modules.three_d.glb import sanitize_node_name as _sanitize

log = logging.getLogger(__name__)

# Only these Blender MCP tools are offered to Claude. Asset downloads (Poly Haven, Sketchfab)
# and paid generators (Hyper3D, Tripo, ...) are deliberately excluded.
ALLOWED_TOOLS = frozenset(
    {"execute_blender_code", "get_scene_info", "get_object_info", "look", "get_viewport_screenshot"}
)
CODE_TOOL = "execute_blender_code"
MARK = "EDU3D_JSON:"
MAX_PARTS = 120

_SETUP = """
import bpy, json
name = {scene!r}
win = bpy.context.window or bpy.context.window_manager.windows[0]
prev = win.scene.name
scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
win.scene = scene
print({mark!r} + json.dumps({{"previous": prev, "scene": scene.name}}))
"""

# Verified against Blender 5.2: the exporter follows the WINDOW's scene, so switch it first.
_EXPORT = """
import bpy, json
scene = bpy.data.scenes[{scene!r}]
win = bpy.context.window or bpy.context.window_manager.windows[0]
prev = win.scene
win.scene = scene
meshes = [o.name for o in scene.objects if o.type == "MESH"]
if not meshes:
    raise RuntimeError("The scene has no mesh objects to export.")
with bpy.context.temp_override(window=win, scene=scene, view_layer=scene.view_layers[0]):
    bpy.ops.export_scene.gltf(
        filepath={path!r}, export_format="GLB", use_active_scene=True, use_visible=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
win.scene = prev
print({mark!r} + json.dumps({{"objects": meshes}}))
"""

_CLEANUP = """
import bpy
win = bpy.context.window or bpy.context.window_manager.windows[0]
scene = bpy.data.scenes.get({scene!r})
back = bpy.data.scenes.get({previous!r})
if scene is not None:
    if win.scene == scene:
        win.scene = back or next(s for s in bpy.data.scenes if s != scene)
    bpy.data.scenes.remove(scene)
"""


@dataclass
class _Run:
    status: ProviderTaskStatus
    started: float
    data: bytes | None = None
    parts: list[dict[str, str]] | None = None
    usage: LLMUsage | None = None
    error: str | None = None


class BlenderMCPProvider:
    name = "blender"
    _runs: dict[str, _Run] = {}
    _runs_lock = threading.Lock()
    _blender_lock = threading.Lock()  # one Blender instance: builds run one after another

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        effort: str,
        command: str,
        host: str,
        port: int,
        max_turns: int,
        timeout_s: float,
        system_prompt: str,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.effort = effort
        self.command = shlex.split(command)
        self.host = host
        self.port = port
        self.max_turns = max_turns
        self.timeout_s = timeout_s
        self.system_prompt = system_prompt

    # ------------------------------------------------------------------ health
    def health(self) -> tuple[bool, str]:
        """Is the MCP for Blender add-on listening? (A plain TCP connect, no code is run.)"""
        try:
            with socket.create_connection((self.host, self.port), timeout=1.5):
                return True, f"Blender is reachable at {self.host}:{self.port}."
        except OSError:
            return False, (
                f"Blender is not reachable at {self.host}:{self.port}. Open Blender, enable the "
                "'MCP for Blender' add-on and start its server (3D View sidebar > MCP for Blender)."
            )

    # ------------------------------------------------------- provider protocol
    def create_task(self, *, prompt: str, idempotency_key: str) -> ThreeDTask:
        task_id = "blender_" + hashlib.sha256(idempotency_key.encode()).hexdigest()[:20]
        with self._runs_lock:
            if task_id not in self._runs:
                ok, message = self.health()
                if not ok:
                    raise ProviderPermanentError(message)
                self._runs[task_id] = _Run(ProviderTaskStatus.RUNNING, time.time())
                threading.Thread(
                    target=self._work, args=(task_id, prompt), name=task_id, daemon=True
                ).start()
        return self.get_task(task_id)

    def get_task(self, provider_task_id: str) -> ThreeDTask:
        run = self._runs.get(provider_task_id)
        if run is None:
            return ThreeDTask(
                self.name,
                provider_task_id,
                ProviderTaskStatus.FAILED,
                error_code="The Blender build was lost (server restarted); please generate again.",
            )
        return ThreeDTask(
            self.name,
            provider_task_id,
            run.status,
            error_code=run.error,
            llm_usage=run.usage,
            part_metadata=run.parts,
        )

    def fetch_output(self, task: ThreeDTask, max_bytes: int) -> bytes:
        with self._runs_lock:
            run = self._runs.pop(task.provider_task_id, None)
        if run is None or run.data is None:
            raise ProviderPermanentError("The Blender result was lost; please generate again.")
        if len(run.data) > max_bytes:
            raise ProviderPermanentError("The Blender model exceeds the size limit.")
        return run.data

    # ----------------------------------------------------------------- the build
    def _work(self, task_id: str, prompt: str) -> None:
        run = self._runs[task_id]
        with self._blender_lock:
            try:
                data, parts, usage = asyncio.run(
                    asyncio.wait_for(self._build(task_id, prompt), self.timeout_s)
                )
            except TimeoutError:
                run.error = f"The Blender build took longer than {int(self.timeout_s)} s."
                run.status = ProviderTaskStatus.FAILED
            except ProviderPermanentError as exc:
                run.error = str(exc)[:400]
                run.status = ProviderTaskStatus.FAILED
            except Exception as exc:  # report, never crash the worker thread
                log.exception("blender build %s failed", task_id)
                cause = _root_cause(exc)
                if isinstance(cause, ProviderPermanentError):
                    run.error = str(cause)[:400]
                else:
                    run.error = f"Blender build failed: {type(cause).__name__}: {str(cause)[:300]}"
                run.status = ProviderTaskStatus.FAILED
            else:
                run.data, run.parts, run.usage = data, parts, usage
                run.status = ProviderTaskStatus.SUCCEEDED

    async def _build(
        self, task_id: str, prompt: str
    ) -> tuple[bytes, list[dict[str, str]], LLMUsage]:
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client

        env = {
            **os.environ,
            "BLENDER_HOST": self.host,
            "BLENDER_PORT": str(self.port),
            "DISABLE_TELEMETRY": "true",
        }
        params = StdioServerParameters(command=self.command[0], args=self.command[1:], env=env)
        scene = f"edu3d_{task_id[-12:]}"
        async with stdio_client(params) as (read, write), ClientSession(read, write) as mcp:
            await mcp.initialize()
            tools = [t for t in (await mcp.list_tools()).tools if t.name in ALLOWED_TOOLS]
            if CODE_TOOL not in {t.name for t in tools}:
                raise ProviderPermanentError("The Blender MCP server has no code execution tool.")
            setup = await self._code(mcp, _SETUP.format(scene=scene, mark=MARK))
            try:
                final, usage = await self._agent(mcp, tools, prompt)
                with tempfile.TemporaryDirectory(prefix="edu3d_blender_") as tmp:
                    path = str(Path(tmp) / "model.glb")
                    out = await self._code(mcp, _EXPORT.format(scene=scene, path=path, mark=MARK))
                    data = Path(path).read_bytes()
            finally:
                try:
                    await self._code(
                        mcp, _CLEANUP.format(scene=scene, previous=setup.get("previous", ""))
                    )
                except Exception:  # cleanup must never hide the real result
                    log.warning("blender cleanup failed for %s", scene)
        return data, parts_metadata(out.get("objects", []), final), usage

    async def _agent(self, mcp: Any, tools: list[Any], prompt: str) -> tuple[str, LLMUsage]:
        from anthropic import AsyncAnthropic
        from anthropic.lib.tools.mcp import async_mcp_tool

        client = AsyncAnthropic(api_key=self.api_key, max_retries=2, timeout=300)
        brief = (
            "Build this educational 3D model in the current Blender scene."
            f"\n\n<brief>\n{prompt}\n</brief>"
        )
        # Typed loosely: the SDK's TypedDict params are checked at runtime by the API.
        messages: list[Any] = [{"role": "user", "content": brief}]
        thinking: Any = {"type": "adaptive"}
        output_config: Any = {"effort": self.effort}
        runner = client.beta.messages.tool_runner(
            model=self.model,
            max_tokens=16000,
            system=self.system_prompt,
            thinking=thinking,
            output_config=output_config,
            max_iterations=self.max_turns,
            tools=[async_mcp_tool(t, mcp) for t in tools],
            messages=messages,
        )
        tokens_in = tokens_out = 0
        final: Any = None
        async for message in runner:
            u = message.usage
            tokens_in += (
                u.input_tokens
                + (u.cache_creation_input_tokens or 0)
                + (u.cache_read_input_tokens or 0)
            )
            tokens_out += u.output_tokens
            final = message
        if final is None:
            raise ProviderPermanentError("Claude did not respond.")
        if final.stop_reason == "refusal":
            raise ProviderPermanentError("Claude declined to build this model.")
        text = "".join(getattr(b, "text", "") for b in final.content if b.type == "text")
        usage = LLMUsage("anthropic", self.model, tokens_in, tokens_out, final.id)
        return text, usage

    async def _code(self, mcp: Any, code: str) -> dict[str, Any]:
        result = await mcp.call_tool(CODE_TOOL, {"code": code})
        text = "".join(getattr(c, "text", "") for c in result.content)
        # mcp >= 2 names it `is_error` (1.x: `isError`).
        failed = getattr(result, "is_error", None) or getattr(result, "isError", False)
        if failed or text.startswith("Error"):
            raise ProviderPermanentError(f"Blender reported an error: {text[:300]}")
        for line in reversed(text.splitlines()):
            if MARK in line:
                payload: dict[str, Any] = json.loads(line.split(MARK, 1)[1])
                return payload
        return {}


def _root_cause(exc: BaseException) -> BaseException:
    """asyncio/anyio wrap errors in (nested) ExceptionGroups; report the first real one."""
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return exc


def parts_metadata(objects: list[str], final_text: str) -> list[dict[str, str]]:
    """Merge Claude's final JSON (labels, descriptions) with the objects actually exported."""
    claimed: dict[str, dict[str, str]] = {}
    match = re.search(r"\{.*\}", final_text, re.DOTALL)
    if match:
        try:
            for p in json.loads(match.group(0)).get("parts", []):
                if isinstance(p, dict) and p.get("name"):
                    claimed[_sanitize(str(p["name"]))] = p
        except (ValueError, AttributeError):
            pass
    out = []
    for obj in objects[:MAX_PARTS]:
        name = _sanitize(obj)
        p = claimed.get(name, {})
        out.append(
            {
                "name": name,
                "label": (str(p.get("label") or "").strip() or name.replace("_", " "))[:200],
                "description": str(p.get("description") or "").strip()[:1000],
            }
        )
    return out
