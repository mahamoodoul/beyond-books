"""Object storage adapters: local filesystem (dev/tests) and private S3 (pilot)."""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt

from app.core.config import get_settings
from app.integrations.interfaces import ObjectStorageProvider, PresignedUpload, StoredObject

_SAFE_KEY = re.compile(r"^[a-z0-9][a-z0-9/_\-.]{0,400}$")


def validate_key(key: str) -> str:
    if not _SAFE_KEY.match(key) or ".." in key or "//" in key:
        raise ValueError("unsafe storage key")
    return key


class LocalStorage:
    """Stores objects under EDU3D_LOCAL_STORAGE_DIR. Uploads go through a signed, short-lived
    backend URL (PUT /api/v1/storage/uploads/{token}) that mimics an S3 presigned PUT."""

    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / validate_key(key)).resolve()
        if self.root not in path.parents:
            raise ValueError("unsafe storage key")
        return path

    def presigned_upload(
        self, *, key: str, content_type: str, max_bytes: int, expires_in_s: int
    ) -> PresignedUpload:
        s = get_settings()
        token = jwt.encode(
            {
                "typ": "upload",
                "key": validate_key(key),
                "ct": content_type,
                "max": max_bytes,
                "exp": datetime.now(UTC) + timedelta(seconds=expires_in_s),
            },
            s.jwt_secret,
            algorithm="HS256",
        )
        return PresignedUpload(
            url=f"{s.api_v1_prefix}/storage/uploads/{token}",
            method="PUT",
            headers={"Content-Type": content_type},
        )

    @staticmethod
    def decode_upload_token(token: str) -> dict[str, Any] | None:
        try:
            data: dict[str, Any] = jwt.decode(
                token,
                get_settings().jwt_secret,
                algorithms=["HS256"],
                options={"require": ["exp", "key", "typ"]},
            )
        except jwt.PyJWTError:
            return None
        return data if data.get("typ") == "upload" else None

    def head(self, key: str) -> StoredObject | None:
        path = self._path(key)
        return StoredObject(size_bytes=path.stat().st_size) if path.is_file() else None

    def read_bytes(self, key: str, max_bytes: int) -> bytes:
        with self._path(key).open("rb") as f:
            return f.read(max_bytes)

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class S3Storage:
    """Private bucket; access only through short-lived presigned URLs."""

    def __init__(self, bucket: str, region: str) -> None:
        import boto3

        self.bucket = bucket
        self.client = boto3.client("s3", region_name=region)

    def presigned_upload(
        self, *, key: str, content_type: str, max_bytes: int, expires_in_s: int
    ) -> PresignedUpload:
        # Presigned PUT cannot enforce size; the size is verified in /documents/{id}/complete.
        url = self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": validate_key(key), "ContentType": content_type},
            ExpiresIn=expires_in_s,
        )
        return PresignedUpload(url=url, method="PUT", headers={"Content-Type": content_type})

    def head(self, key: str) -> StoredObject | None:
        from botocore.exceptions import ClientError

        try:
            res = self.client.head_object(Bucket=self.bucket, Key=validate_key(key))
        except ClientError:
            return None
        return StoredObject(size_bytes=int(res["ContentLength"]))

    def read_bytes(self, key: str, max_bytes: int) -> bytes:
        res = self.client.get_object(
            Bucket=self.bucket, Key=validate_key(key), Range=f"bytes=0-{max_bytes - 1}"
        )
        data: bytes = res["Body"].read()
        return data

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.bucket, Key=validate_key(key), Body=data, ContentType=content_type
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=validate_key(key))


def get_storage() -> ObjectStorageProvider:
    s = get_settings()
    if s.storage_backend == "s3":
        return S3Storage(s.s3_bucket, s.s3_region)
    return LocalStorage(s.local_storage_dir)
