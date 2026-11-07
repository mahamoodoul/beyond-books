"""ElevenLabs client (text to speech, speech to text, voices).

The key comes from EDU3D_ELEVENLABS_API_KEY (the app's .env, like every other provider key).
For compatibility the SDK's own ELEVENLABS_API_KEY environment variable, or a git-ignored
.env.local created by `npx @elevenlabs/cli onboard`, still works when the setting is empty.
Real environment variables always win over the file. The key never goes in code.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

from app.core.config import get_settings

ENV_FILE = Path(__file__).resolve().parents[4] / ".env.local"


def api_key() -> str:
    """The configured key, or "" when voice features are off."""
    key = get_settings().elevenlabs_api_key
    if key:
        return key
    if ENV_FILE.is_file():
        load_dotenv(ENV_FILE, override=False)
    return os.environ.get("ELEVENLABS_API_KEY", "")


def is_configured() -> bool:
    return bool(api_key())


@lru_cache(maxsize=1)
def get_client() -> ElevenLabs:
    """Shared ElevenLabs client, created on first use."""
    return ElevenLabs(api_key=api_key() or None)
