"""Provider interfaces (design §3 "Provider abstraction").

Business logic depends ONLY on these protocols and normalized types — never on a vendor SDK
or vendor response shape. Each integrations/<vendor>/ package implements one or more of them.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

from pydantic import BaseModel

# ----------------------------------------------------------------------------- LLM


@dataclass(frozen=True)
class LLMUsage:
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    provider_request_id: str | None = None


@dataclass(frozen=True)
class StructuredResult[T: BaseModel]:
    output: T
    usage: LLMUsage


@dataclass(frozen=True)
class ReferencePassage:
    """Retrieved document text. Always passed to the model as UNTRUSTED data (design §6.4)."""

    document_id: str
    page_start: int
    page_end: int
    text: str


class ProviderTransientError(Exception):
    """Timeouts, rate limits, 5xx: safe to retry."""


class ProviderPermanentError(Exception):
    """Refusals, invalid requests, unparseable output: do not retry."""


class LLMProvider(Protocol):
    name: str
    model: str

    def generate_structured[T: BaseModel](
        self,
        *,
        system_prompt: str,
        task: str,
        references: list[ReferencePassage],
        output_schema: type[T],
        prompt_version: str,
        max_output_tokens: int,
    ) -> StructuredResult[T]:
        """Return output validated against `output_schema`, or raise."""
        ...


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


# ------------------------------------------------------------------- 3D generation


class ProviderTaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True)
class ThreeDTask:
    provider: str
    provider_task_id: str
    status: ProviderTaskStatus
    output_download_url: str | None = None
    credits_used: float | None = None
    error_code: str | None = None
    transient_error: bool = False


class ThreeDGenerationProvider(Protocol):
    name: str

    def create_task(self, *, prompt: str, idempotency_key: str) -> ThreeDTask: ...

    def get_task(self, provider_task_id: str) -> ThreeDTask: ...


# ------------------------------------------------------------------------ storage


@dataclass(frozen=True)
class PresignedUpload:
    url: str
    method: str
    headers: dict[str, str]


@dataclass(frozen=True)
class StoredObject:
    size_bytes: int


class ObjectStorageProvider(Protocol):
    """Private object storage. Keys are server-generated; never derived from user filenames."""

    def presigned_upload(
        self, *, key: str, content_type: str, max_bytes: int, expires_in_s: int
    ) -> PresignedUpload: ...

    def presigned_download(self, *, key: str, content_type: str, expires_in_s: int) -> str: ...

    def head(self, key: str) -> StoredObject | None: ...

    def read_bytes(self, key: str, max_bytes: int) -> bytes: ...

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, key: str) -> None: ...


# ---------------------------------------------------------------------- documents


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str
    method: str  # e.g. "text_layer" | "ocr"
    needs_ocr: bool = False


@dataclass(frozen=True)
class ExtractedDocument:
    page_count: int
    pages: list[ExtractedPage] = field(default_factory=list)


class DocumentExtractionProvider(Protocol):
    def extract(self, local_path: str) -> ExtractedDocument: ...
