"""OpenAI adapter for LLMProvider (Responses API + structured outputs).

Verify the configured model's structured-output support, data controls and pricing before use
(open decision #3). Responses are requested with store=False.
"""

from pydantic import BaseModel

from app.integrations.interfaces import (
    LLMUsage,
    ProviderPermanentError,
    ProviderTransientError,
    ReferencePassage,
    StructuredResult,
)
from app.modules.ai_engine.prompting import render_input


class OpenAIProvider:
    name = "openai"

    def __init__(
        self, api_key: str, model: str, timeout_s: float, base_url: str | None = None
    ) -> None:
        import openai

        self.model = model
        self._openai = openai
        # Retries are owned by our job runner (bounded, with backoff), not the SDK.
        # base_url lets any OpenAI-compatible endpoint be used without new code.
        self.client = openai.OpenAI(
            api_key=api_key, timeout=timeout_s, max_retries=0, base_url=base_url
        )

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
        oa = self._openai
        try:
            resp = self.client.responses.parse(
                model=self.model,
                instructions=system_prompt,
                input=render_input(task, references),
                text_format=output_schema,
                max_output_tokens=max_output_tokens,
                store=False,
                metadata={"prompt_version": prompt_version},
            )
        except (
            oa.RateLimitError,
            oa.APITimeoutError,
            oa.APIConnectionError,
            oa.InternalServerError,
        ) as exc:
            raise ProviderTransientError(type(exc).__name__) from exc
        except oa.APIStatusError as exc:
            raise ProviderPermanentError(
                f"LLM provider rejected the request ({exc.status_code})"
            ) from exc

        parsed = resp.output_parsed
        if parsed is None or not isinstance(parsed, output_schema):
            raise ProviderPermanentError("The model returned no valid structured output.")
        usage = resp.usage
        return StructuredResult(
            output=parsed,
            usage=LLMUsage(
                provider=self.name,
                model=self.model,
                input_tokens=usage.input_tokens if usage else 0,
                output_tokens=usage.output_tokens if usage else 0,
                provider_request_id=resp.id,
            ),
        )
