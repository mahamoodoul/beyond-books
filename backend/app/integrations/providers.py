"""Provider registry — the ONE place that knows which LLM and 3D providers exist.

Adding a provider (any vendor or model family) = three steps, no other code changes:
  1. Write an adapter implementing `LLMProvider` or `ThreeDGenerationProvider`
     (app/integrations/interfaces.py) under app/integrations/<vendor>/.
  2. Add its settings fields to `Settings` (app/core/config.py), e.g. `acme_api_key`.
  3. `register(ProviderSpec(...))` below, listing the settings it requires.
Then select it in .env: EDU3D_LLM_PROVIDER=<name> or EDU3D_THREE_D_PROVIDER=<name>.
Startup validates the name and that every required setting is non-empty.
Models are configuration, not code: change e.g. EDU3D_ANTHROPIC_MODEL to switch model.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from app.core.config import Settings
    from app.integrations.interfaces import LLMProvider, ThreeDGenerationProvider

Kind = Literal["llm", "three_d"]


@dataclass(frozen=True)
class ProviderSpec:
    kind: Kind
    name: str
    description: str
    required_settings: tuple[str, ...]
    factory: Callable[["Settings"], Any]  # imports the vendor SDK lazily
    production_ready: bool = True


_REGISTRY: dict[tuple[Kind, str], ProviderSpec] = {}


def register(spec: ProviderSpec) -> ProviderSpec:
    _REGISTRY[(spec.kind, spec.name)] = spec
    return spec


def get_spec(kind: Kind, name: str) -> ProviderSpec | None:
    return _REGISTRY.get((kind, name))


def names(kind: Kind) -> list[str]:
    return sorted(n for k, n in _REGISTRY if k == kind)


def env_name(field: str) -> str:
    return f"EDU3D_{field.upper()}"


def validate(kind: Kind, name: str, settings: "Settings") -> list[str]:
    """Return configuration problems for the selected provider (empty = OK)."""
    spec = get_spec(kind, name)
    if spec is None:
        return [f"unknown {kind} provider '{name}' (available: {', '.join(names(kind))})"]
    missing = [env_name(f) for f in spec.required_settings if not getattr(settings, f, None)]
    return [f"{kind} provider '{name}' requires {', '.join(missing)}"] if missing else []


def build_llm(settings: "Settings") -> "LLMProvider":
    spec = get_spec("llm", settings.llm_provider)
    assert spec is not None, "validated at startup"
    provider: LLMProvider = spec.factory(settings)
    return provider


def build_three_d(settings: "Settings", name: str | None = None) -> "ThreeDGenerationProvider":
    """Build the default 3D provider, or a specific one chosen per request."""
    spec = get_spec("three_d", name or settings.three_d_provider)
    if spec is None or validate("three_d", spec.name, settings) or not _allowed(spec, settings):
        raise ValueError(f"3D provider '{name}' is not available")
    provider: ThreeDGenerationProvider = spec.factory(settings)
    return provider


# ------------------------------------------------------------------- built-in LLMs


def _fake_llm(s: "Settings") -> Any:
    from app.modules.ai_engine.fake import FakeLLMProvider

    return FakeLLMProvider()


def _anthropic(s: "Settings") -> Any:
    from app.integrations.anthropic.provider import AnthropicProvider

    return AnthropicProvider(
        s.anthropic_api_key, s.anthropic_model, s.anthropic_effort, s.llm_timeout_s
    )


def _openai(s: "Settings") -> Any:
    from app.integrations.openai.provider import OpenAIProvider

    return OpenAIProvider(
        s.openai_api_key, s.openai_model, s.llm_timeout_s, base_url=s.openai_base_url or None
    )


register(
    ProviderSpec(
        "llm",
        "fake",
        "Deterministic offline output for dev/tests",
        (),
        _fake_llm,
        production_ready=False,
    )
)
register(
    ProviderSpec(
        "llm",
        "anthropic",
        "Claude via the Anthropic Messages API",
        ("anthropic_api_key", "anthropic_model"),
        _anthropic,
    )
)
register(
    ProviderSpec(
        "llm",
        "openai",
        "OpenAI Responses API (or a compatible base URL)",
        ("openai_api_key", "openai_model"),
        _openai,
    )
)


# --------------------------------------------------------------- built-in 3D providers


def _fake_3d(s: "Settings") -> Any:
    from app.integrations.three_d import FAKE_PROVIDER

    return FAKE_PROVIDER


def _llm_3d(s: "Settings") -> Any:
    from app.integrations.three_d.llm_procedural import LLMThreeDProvider
    from app.modules.ai_engine.model_tuning import three_d_system_prompt
    from app.modules.ai_engine.prompts import THREE_D_MODEL_DESIGN

    system, ref = three_d_system_prompt(THREE_D_MODEL_DESIGN, s)
    return LLMThreeDProvider(
        build_llm(s), s.llm_max_output_tokens, system_prompt=system, prompt_ref=ref
    )


def _tripo(s: "Settings") -> Any:
    from app.integrations.three_d import TripoProvider

    return TripoProvider(api_key=s.tripo_api_key)


def _meshy(s: "Settings") -> Any:
    from app.integrations.three_d import MeshyProvider

    return MeshyProvider(api_key=s.meshy_api_key)


register(
    ProviderSpec(
        "three_d",
        "fake",
        "Offline multi-part GLB generator for dev/tests",
        (),
        _fake_3d,
        production_ready=False,
    )
)
register(
    ProviderSpec(
        "three_d",
        "llm",
        "The configured LLM designs the model from named primitives (rendered by three.js)",
        (),
        _llm_3d,
    )
)


def _blender(s: "Settings") -> Any:
    from app.integrations.blender.provider import BlenderMCPProvider
    from app.modules.ai_engine.model_tuning import three_d_system_prompt
    from app.modules.ai_engine.prompts import BLENDER_BUILD

    system, _ref = three_d_system_prompt(BLENDER_BUILD, s)
    return BlenderMCPProvider(
        api_key=s.anthropic_api_key,
        model=s.blender_model or s.anthropic_model,
        effort=s.three_d_effort or s.anthropic_effort,
        command=s.blender_mcp_command,
        host=s.blender_host,
        port=s.blender_port,
        max_turns=s.blender_max_turns,
        timeout_s=s.blender_timeout_s,
        system_prompt=system,
        export_dir=s.blender_export_dir,
    )


register(
    ProviderSpec(
        "three_d",
        "blender",
        "Claude builds the model in your local Blender through Blender MCP (dev only)",
        ("anthropic_api_key", "blender_mcp_command"),
        _blender,
        production_ready=False,
    )
)
register(
    ProviderSpec(
        "three_d", "tripo", "Tripo (adapter pending API verification)", ("tripo_api_key",), _tripo
    )
)
register(
    ProviderSpec(
        "three_d", "meshy", "Meshy (adapter pending API verification)", ("meshy_api_key",), _meshy
    )
)


def _allowed(spec: ProviderSpec, settings: "Settings") -> bool:
    """Dev-only providers (fake, blender) are refused in staging/production, except blender when
    EDU3D_BLENDER_ALLOW_IN_PRODUCTION is set (Blender in a private container next to the API)."""
    if spec.production_ready or settings.environment not in {"staging", "production"}:
        return True
    return spec.name == "blender" and settings.blender_allow_in_production


def available(kind: Kind, settings: "Settings") -> list[ProviderSpec]:
    """Providers whose required settings are present (selectable per request)."""
    return [
        spec
        for (k, n), spec in sorted(_REGISTRY.items())
        if k == kind and not validate(kind, n, settings) and _allowed(spec, settings)
    ]
