from typing import Any

import pytest

from app.core.config import Settings
from app.integrations import providers
from app.integrations.anthropic.provider import AnthropicProvider
from app.integrations.providers import ProviderSpec, build_llm, build_three_d, register


def test_builtin_providers_registered() -> None:
    assert providers.names("llm") == ["anthropic", "fake", "openai"]
    assert providers.names("three_d") == ["fake", "llm", "meshy", "tripo"]


def test_unknown_provider_lists_options() -> None:
    with pytest.raises(ValueError, match=r"unknown llm provider 'gemini' \(available: anthropic"):
        Settings(llm_provider="gemini")  # type: ignore[call-arg]


@pytest.mark.parametrize(
    ("kwargs", "env"),
    [
        ({"llm_provider": "anthropic"}, "EDU3D_ANTHROPIC_API_KEY"),
        ({"llm_provider": "openai", "openai_api_key": "k"}, "EDU3D_OPENAI_MODEL"),
        ({"three_d_provider": "meshy"}, "EDU3D_MESHY_API_KEY"),
    ],
)
def test_missing_required_settings_named(kwargs: dict[str, Any], env: str) -> None:
    with pytest.raises(ValueError, match=env):
        Settings(**kwargs)  # type: ignore[arg-type]


def test_builds_configured_provider() -> None:
    s = Settings(llm_provider="anthropic", anthropic_api_key="k")  # type: ignore[call-arg]
    llm = build_llm(s)
    assert isinstance(llm, AnthropicProvider) and llm.model == "claude-opus-5-5"
    assert build_three_d(Settings()).name == "fake"


def test_new_provider_plugs_in_without_touching_callers() -> None:
    class EchoLLM:
        name, model = "echo", "echo-1"

    register(ProviderSpec("llm", "echo", "test provider", (), lambda s: EchoLLM()))
    try:
        assert build_llm(Settings(llm_provider="echo")).name == "echo"  # type: ignore[call-arg]
    finally:
        providers._REGISTRY.pop(("llm", "echo"))


def test_fake_providers_blocked_in_production() -> None:
    with pytest.raises(ValueError, match="not allowed in staging/production"):
        Settings(
            environment="production",
            jwt_secret="x" * 40,
            cookie_secure=True,  # type: ignore[call-arg]
            jobs_run_inline=False,
            llm_provider="fake",
        )
