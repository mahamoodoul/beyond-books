from pydantic import BaseModel, Field


class SpeechIn(BaseModel):
    """Text to read aloud: one tour step (part name, explanation, link to the topic)."""

    text: str = Field(min_length=1, max_length=4000)


class SpeechStatus(BaseModel):
    """Whether voice narration is available on this server (an ElevenLabs key is configured)."""

    enabled: bool
    voice_id: str | None = None
    model: str | None = None
