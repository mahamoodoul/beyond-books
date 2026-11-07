"""Anthropic (Claude) adapter for LLMProvider — Messages API structured outputs.

- `messages.parse(output_format=<Pydantic model>)` returns a validated instance.
- Claude Opus 5.5 always uses adaptive thinking; depth is controlled with `output_config.effort`
  (its default is "medium", so it is set explicitly from settings).
- Server-side refusal fallbacks are enabled (`fallbacks: "default"`): if a safety classifier
  declines, the API re-runs the request on a fallback model inside the same call.
- SDK retries are disabled: the job runner owns retries with backoff.
"""

from typing import Any

from pydantic import BaseModel, ValidationError

from app.integrations.interfaces import (
    LLMUsage,
    ProviderPermanentError,
    ProviderTransientError,
    ReferencePassage,
    StructuredResult,
)
from app.modules.ai_engine.prompting import render_input

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str, timeout_s: float) -> None:
        import anthropic

        self.model = model
        self.effort = effort
        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=0)

    def generate_structured[T: BaseModel](
        self,
        *,
        system_prompt: str,
        task: str,
        references: list[ReferencePassage],
        output_schema: type[T],
        prompt_version: str,
        max_output_tokens: int,
    ) -> StructuredResult[T]:
        an = self._anthropic
        try:
            resp: Any = self.client.beta.messages.parse(
                model=self.model,
                max_tokens=max_output_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": render_input(task, references)}],
                output_format=output_schema,
                output_config={"effort": self.effort},  # type: ignore[arg-type]
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except (
            an.RateLimitError,
            an.APITimeoutError,
            an.APIConnectionError,
            an.InternalServerError,
        ) as exc:
            raise ProviderTransientError(type(exc).__name__) from exc
        except an.APIStatusError as exc:
            if exc.status_code == 529:  # overloaded
                raise ProviderTransientError("overloaded") from exc
            raise ProviderPermanentError(
                f"Claude API rejected the request ({exc.status_code})"
            ) from exc
        except (ValidationError, ValueError) as exc:
            # The SDK parses the JSON inside the call: a cut-off or malformed answer fails here,
            # before stop_reason can be checked. Report it instead of crashing the job.
            raise ProviderPermanentError(
                "The AI's answer was cut off or incomplete before it finished (usually the "
                "output was too long). Try a simpler request, or raise "
                "EDU3D_LLM_MAX_OUTPUT_TOKENS."
            ) from exc

        if resp.stop_reason == "refusal":
            category = getattr(getattr(resp, "stop_details", None), "category", None)
            raise ProviderPermanentError(
                f"The model declined this request ({category or 'refusal'})."
            )
        if resp.stop_reason == "max_tokens":
            raise ProviderPermanentError(
                "The response was cut off (max output tokens reached); "
                "raise EDU3D_LLM_MAX_OUTPUT_TOKENS."
            )
        parsed = getattr(resp, "parsed_output", None)
        if parsed is None or not isinstance(parsed, output_schema):
            raise ProviderPermanentError("The model returned no valid structured output.")
        usage = resp.usage
        return StructuredResult(
            output=parsed,
            usage=LLMUsage(
                provider=self.name,
                model=str(getattr(resp, "model", self.model)),
                input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
                output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
                provider_request_id=getattr(resp, "_request_id", None) or resp.id,
            ),
        )
