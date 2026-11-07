"""Local-storage upload endpoint (dev/test only; S3 uploads go straight to the bucket)."""

from fastapi import APIRouter, Request, status

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
    claims = LocalStorage.decode_upload_token(token)
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
