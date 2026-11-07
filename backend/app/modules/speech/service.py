"""Text to speech for the Studio tour.

Each distinct text is synthesised once and kept in object storage under a content hash, so a
class listening to the same tour costs one ElevenLabs call per part, not one per student.
Only new syntheses count against the per-user rate limit.
"""

from __future__ import annotations

import hashlib
import logging
import re

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations import elevenlabs
from app.integrations.storage import get_storage

log = logging.getLogger(__name__)

AUDIO_CONTENT_TYPE = "audio/mpeg"
_MAX_CACHED_BYTES = 20 * 1024 * 1024
_MARKUP = re.compile(r"[*_`#>\[\]]+")
_SPACES = re.compile(r"\s+")


class SpeechUnavailableError(AppError):
    status_code = 503
    code = "SPEECH_UNAVAILABLE"
    message = "Voice narration is not configured on this server."


class SpeechFailedError(AppError):
    status_code = 502
    code = "SPEECH_FAILED"
    message = "The voice service could not read this text. Try again in a moment."


speech_limiter = SlidingWindowLimiter()


def enabled() -> bool:
    return elevenlabs.is_configured()


def normalise(text: str, max_chars: int) -> str:
    """Plain, speakable text: markdown marks and extra whitespace removed, cut at a sentence end."""
    clean = _SPACES.sub(" ", _MARKUP.sub("", text)).strip()
    if len(clean) <= max_chars:
        return clean
    head = clean[:max_chars]
    cut = max(head.rfind(". "), head.rfind("! "), head.rfind("? "))
    return (head[: cut + 1] if cut > max_chars // 2 else head).strip()


def cache_key(text: str, voice_id: str, model: str) -> str:
    digest = hashlib.sha256(f"{model}|{voice_id}|{text}".encode()).hexdigest()
    return f"speech/{digest}.mp3"


def _synthesize(text: str, voice_id: str, model: str) -> bytes:
    """One ElevenLabs call. Kept separate so tests can replace it."""
    audio = elevenlabs.get_client().text_to_speech.convert(
        voice_id=voice_id, text=text, model_id=model, output_format="mp3_44100_128"
    )
    return audio if isinstance(audio, bytes) else b"".join(audio)


def speak(user_id: object, text: str) -> tuple[bytes, bool]:
    """MP3 bytes for the text and whether they came from the cache."""
    if not enabled():
        raise SpeechUnavailableError()
    s = get_settings()
    clean = normalise(text, s.speech_max_chars)
    if not clean:
        raise AppError("There is nothing to read aloud.")
    key = cache_key(clean, s.elevenlabs_voice_id, s.elevenlabs_model)
    storage = get_storage()
    if storage.head(key) is not None:
        return storage.read_bytes(key, _MAX_CACHED_BYTES), True
    speech_limiter.hit(f"speech:{user_id}", s.speech_per_user_per_hour, 3600)
    try:
        data = _synthesize(clean, s.elevenlabs_voice_id, s.elevenlabs_model)
    except Exception as exc:  # the vendor SDK raises many types; none should reach the client
        log.warning("elevenlabs text-to-speech failed: %s", exc)
        raise SpeechFailedError() from exc
    if not data:
        raise SpeechFailedError()
    storage.put_bytes(key, data, AUDIO_CONTENT_TYPE)
    return data, False
