"""Local-storage upload endpoint (dev/test only; S3 uploads go straight to the bucket)."""

from fastapi import APIRouter, Request, status
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.integrations.storage import LocalStorage, get_storage

router = APIRouter(prefix="/storage", tags=["storage"], include_in_schema=False)


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"
    message = "The upload exceeds the allowed size."


@router.put("/uploads/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def local_upload(token: str, request: Request) -> None:
    storage = get_storage()
    claims = LocalStorage.decode_token(token, "upload")
    if get_settings().storage_backend != "local" or claims is None:
        raise NotFoundError()
    if request.headers.get("content-type", "").split(";")[0] != claims["ct"]:
        raise AppError("Content-Type does not match the upload request.")
    max_bytes = int(claims["max"])
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise PayloadTooLargeError()
    storage.put_bytes(claims["key"], bytes(body), claims["ct"])


@router.get("/files/{token}")
def local_download(token: str) -> FileResponse:
    """Signed, short-lived download (local storage only). The token is issued only after the
    caller passed authorization for the object (e.g. scene resolution)."""
    storage = get_storage()
    claims = LocalStorage.decode_token(token, "download")
    if get_settings().storage_backend != "local" or claims is None:
        raise NotFoundError()
    assert isinstance(storage, LocalStorage)
    path = storage.path_for(claims["key"])
    if not path.is_file():
        raise NotFoundError()
    return FileResponse(
        path,
        media_type=claims["ct"],
        headers={"Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff"},
    )
