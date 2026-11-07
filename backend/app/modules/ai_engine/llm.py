from app.core.config import get_settings
from app.integrations.interfaces import LLMProvider


def get_llm_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "openai":
        from app.integrations.openai.provider import OpenAIProvider

        return OpenAIProvider(s.openai_api_key, s.openai_model, s.llm_timeout_s)
    from app.modules.ai_engine.fake import FakeLLMProvider

    return FakeLLMProvider()
