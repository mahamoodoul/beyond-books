"""In-process sliding-window limiter for login attempts.

Good enough for a single-instance pilot. Move to Redis before running multiple API replicas.
"""

import threading
import time
from collections import defaultdict, deque

from app.core.config import get_settings
from app.core.errors import RateLimitedError


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_s: int) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                raise RateLimitedError()
            q.append(now)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


login_limiter = SlidingWindowLimiter()


def check_join_lookup_rate(ip: str) -> None:
    """Code previews are public: cap guesses per IP (codes have ~10^9 combinations)."""
    s = get_settings()
    login_limiter.hit(f"join-lookup:{ip}", s.login_max_attempts * 3, s.login_window_s)


def check_login_rate(ip: str, email: str) -> None:
    s = get_settings()
    login_limiter.hit(f"login:{ip}:{email}", s.login_max_attempts, s.login_window_s)
    login_limiter.hit(f"login-ip:{ip}", s.login_max_attempts * 5, s.login_window_s)
