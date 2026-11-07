from fastapi import APIRouter, Response

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.modules.speech import service
from app.modules.speech.schemas import SpeechIn, SpeechStatus

router = APIRouter(prefix="/speech", tags=["speech"])


@router.get("/status", response_model=SpeechStatus)
def speech_status(user: CurrentUser) -> SpeechStatus:
    """Lets the Studio show the Voice button only when narration can actually play."""
    if not service.enabled():
        return SpeechStatus(enabled=False)
    s = get_settings()
    return SpeechStatus(enabled=True, voice_id=s.elevenlabs_voice_id, model=s.elevenlabs_model)


@router.post(
    "",
    response_class=Response,
    responses={200: {"content": {"audio/mpeg": {}}, "description": "MP3 audio of the text"}},
)
def speak(body: SpeechIn, user: CurrentUser) -> Response:
    """Read a tour step aloud. Identical text is synthesised once and served from the cache."""
    data, cached = service.speak(user.id, body.text)
    return Response(
        content=data,
        media_type=service.AUDIO_CONTENT_TYPE,
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Speech-Cache": "hit" if cached else "miss",
        },
    )
