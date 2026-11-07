"""3D generation provider adapters (design §7.1-B, ADR 0009).

Only the fake provider is functional. The Tripo/Meshy adapters are deliberately unimplemented:
their endpoints, auth, output formats, rights and pricing must be verified against current
official documentation first (open decision #5). Do not fill them in from memory.
"""

import hashlib
import re

from app.core.config import get_settings
from app.integrations.interfaces import (
    ProviderPermanentError,
    ProviderTaskStatus,
    ThreeDGenerationProvider,
    ThreeDTask,
)
from app.modules.three_d.demo_heart import build_glb


class FakeThreeDProvider:
    """Deterministic offline provider: turns the prompt into a small multi-part GLB.

    Tasks 'succeed' after one poll so the pending/polling path is exercised too.
    """

    name = "fake"

    def __init__(self) -> None:
        self._polled: set[str] = set()

    def create_task(self, *, prompt: str, idempotency_key: str) -> ThreeDTask:
        task_id = "fake_" + hashlib.sha256(f"{idempotency_key}:{prompt}".encode()).hexdigest()[:16]
        return ThreeDTask(self.name, task_id, ProviderTaskStatus.PENDING)

    def get_task(self, provider_task_id: str) -> ThreeDTask:
        if provider_task_id not in self._polled:
            self._polled.add(provider_task_id)
            return ThreeDTask(self.name, provider_task_id, ProviderTaskStatus.RUNNING)
        return ThreeDTask(
            self.name, provider_task_id, ProviderTaskStatus.SUCCEEDED, credits_used=1.0
        )

    def fetch_output(self, task: ThreeDTask, max_bytes: int) -> bytes:
        words = re.findall(r"[a-z]{3,}", task.provider_task_id + " model")
        seed = int(hashlib.sha256(task.provider_task_id.encode()).hexdigest()[:6], 16)
        parts = [
            ("body", (0.0, 0.0, 0.0), (0.9, 0.7, 0.6), (0.55, 0.6, 0.85, 1.0)),
            ("top", (0.0, 0.9, 0.0), (0.45, 0.35, 0.45), (0.85, 0.55, 0.4, 1.0)),
            ("base", (0.0, -0.85, 0.0), (0.7, 0.2, 0.7), (0.4, 0.75, 0.5, 1.0)),
        ][: 2 + seed % 2]
        data = build_glb(parts, words[0] if words else "model")
        if len(data) > max_bytes:
            raise ProviderPermanentError("Generated model exceeds the size limit.")
        return data


class _UnverifiedProvider:
    name = "unverified"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key

    def _refuse(self) -> ProviderPermanentError:
        return ProviderPermanentError(
            f"The {self.name} adapter is not implemented yet: verify its current API, output "
            "format, commercial rights and pricing first (open decision #5)."
        )

    def create_task(self, *, prompt: str, idempotency_key: str) -> ThreeDTask:
        raise self._refuse()

    def get_task(self, provider_task_id: str) -> ThreeDTask:
        raise self._refuse()

    def fetch_output(self, task: ThreeDTask, max_bytes: int) -> bytes:
        raise self._refuse()


class TripoProvider(_UnverifiedProvider):
    name = "tripo"


class MeshyProvider(_UnverifiedProvider):
    name = "meshy"


# One instance so polling state survives between calls (dev/tests only).
FAKE_PROVIDER = FakeThreeDProvider()


def get_three_d_provider() -> ThreeDGenerationProvider:
    """The configured 3D provider (EDU3D_THREE_D_PROVIDER), built via the provider registry."""
    from app.integrations.providers import build_three_d

    return build_three_d(get_settings())
