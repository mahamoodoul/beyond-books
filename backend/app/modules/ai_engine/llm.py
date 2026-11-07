from app.core.config import get_settings
from app.integrations.interfaces import LLMProvider
from app.integrations.providers import build_llm


def get_llm_provider() -> LLMProvider:
    """The configured LLM (EDU3D_LLM_PROVIDER), built via the provider registry."""
    return build_llm(get_settings())
