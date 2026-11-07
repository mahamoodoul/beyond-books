"""ElevenLabs client (text to speech, speech to text, voices).

The SDK reads ELEVENLABS_API_KEY from the environment; the key never goes in code. In
production set it as an environment variable (Coolify). For local development it is loaded
from the repository's git-ignored .env.local, created by `npx @elevenlabs/cli onboard`.
Real environment variables always win over the file.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

ENV_FILE = Path(__file__).resolve().parents[4] / ".env.local"


@lru_cache(maxsize=1)
def get_client() -> ElevenLabs:
    """Shared ElevenLabs client, created on first use."""
    if ENV_FILE.is_file():
        load_dotenv(ENV_FILE, override=False)
    return ElevenLabs()
