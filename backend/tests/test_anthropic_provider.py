from types import SimpleNamespace
from typing import Any

import anthropic
import httpx2
import pytest

from app.integrations.anthropic.provider import FALLBACK_BETA, AnthropicProvider
from app.integrations.interfaces import ProviderPermanentError, ProviderTransientError
from app.modules.ai_engine.schemas import SectionLLM

SEC = SectionLLM(title="t", body_markdown="b", key_terms=[], source_refs=[])


def _resp(**kw: Any) -> SimpleNamespace:
    base = {
        "stop_reason": "end_turn",
        "parsed_output": SEC,
        "id": "msg_1",
        "_request_id": "req_1",
        "model": "claude-opus-5-5",
        "stop_details": None,
        "usage": SimpleNamespace(input_tokens=12, output_tokens=7),
    }
    return SimpleNamespace(**{**base, **kw})


def _provider(parse: Any) -> AnthropicProvider:
    p = AnthropicProvider(api_key="test", model="claude-opus-5-5", effort="medium", timeout_s=5)
    p.client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse)))  # type: ignore[assignment]
    return p


def _call(p: AnthropicProvider) -> Any:
    return p.generate_structured(
        system_prompt="sys",
        task="t",
        references=[],
        output_schema=SectionLLM,
        prompt_version="x@1",
        max_output_tokens=100,
    )


def test_success_sends_schema_effort_and_fallbacks() -> None:
    seen: dict[str, Any] = {}

    def parse(**kw: Any) -> SimpleNamespace:
        seen.update(kw)
        return _resp()

    result = _call(_provider(parse))
    assert result.output == SEC
    assert result.usage.provider == "anthropic" and result.usage.input_tokens == 12
    assert result.usage.provider_request_id == "req_1"
    assert seen["output_format"] is SectionLLM and seen["system"] == "sys"
    assert seen["output_config"] == {"effort": "medium"}
    assert seen["betas"] == [FALLBACK_BETA] and seen["fallbacks"] == "default"
    assert "thinking" not in seen  # always-on adaptive thinking on Opus 5.5; never send disabled


def test_refusal_and_truncation_are_permanent() -> None:
    with pytest.raises(ProviderPermanentError, match="declined"):
        _call(
            _provider(
                lambda **_: _resp(
                    stop_reason="refusal",
                    parsed_output=None,
                    stop_details=SimpleNamespace(category="cyber"),
                )
            )
        )
    with pytest.raises(ProviderPermanentError, match="cut off"):
        _call(_provider(lambda **_: _resp(stop_reason="max_tokens")))
    with pytest.raises(ProviderPermanentError):
        _call(_provider(lambda **_: _resp(parsed_output=None)))


def test_cut_off_json_is_a_clear_permanent_error() -> None:
    """Regression: a truncated answer made messages.parse raise a pydantic ValidationError,
    which crashed the 3D job as "Unexpected error"."""
    from pydantic import BaseModel, ValidationError

    class M(BaseModel):
        title: str

    def parse(**kw: Any) -> Any:
        try:
            M.model_validate_json('{"title": "Heart", "parts": [{"na')
        except ValidationError as exc:
            raise exc

    with pytest.raises(ProviderPermanentError, match="cut off or incomplete"):
        _call(_provider(parse))


def test_error_mapping() -> None:
    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")

    def timeout(**_: Any) -> None:
        raise anthropic.APITimeoutError(request=req)

    def bad_request(**_: Any) -> None:
        raise anthropic.BadRequestError(
            "bad", response=httpx2.Response(400, request=req), body=None
        )

    with pytest.raises(ProviderTransientError):
        _call(_provider(timeout))
    with pytest.raises(ProviderPermanentError, match="400"):
        _call(_provider(bad_request))


def test_settings_require_key_for_anthropic() -> None:
    from app.core.config import Settings

    with pytest.raises(ValueError, match="ANTHROPIC"):
        Settings(llm_provider="anthropic", anthropic_api_key="")  # type: ignore[call-arg]
