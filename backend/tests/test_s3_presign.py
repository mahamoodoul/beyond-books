"""Presigned URLs must point at the bucket's regional host (browsers fetch them directly)."""

from urllib.parse import urlparse

import pytest

from app.integrations.storage import S3Storage


@pytest.fixture(autouse=True)
def fake_aws_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")


def test_presigned_download_uses_the_regional_bucket_host() -> None:
    url = S3Storage("my-bucket", "eu-north-1").presigned_download(
        key="assets/a/v1/model.glb", content_type="model/gltf-binary", expires_in_s=60
    )
    assert urlparse(url).hostname == "my-bucket.s3.eu-north-1.amazonaws.com"
    assert "X-Amz-Algorithm=AWS4-HMAC-SHA256" in url


def test_presigned_upload_uses_the_regional_bucket_host() -> None:
    upload = S3Storage("my-bucket", "eu-north-1").presigned_upload(
        key="documents/a.pdf", content_type="application/pdf", max_bytes=10, expires_in_s=60
    )
    assert urlparse(upload.url).hostname == "my-bucket.s3.eu-north-1.amazonaws.com"
