"""Educational image search on Wikimedia Commons (free, openly licensed, no API key).

Used by the lesson reader's "Explain with AI": the AI writes a short image query for the selected
words and this returns a few images with licence and author, so they can be shown and credited.
Failures never break the explanation: they return no images.
"""

import html
import re
import time
from typing import Any

import httpx

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia's robot policy requires a User-Agent with contact info (here: the project URL).
USER_AGENT = (
    "BeyondBooks/1.0 (https://github.com/mahamoodoul/beyond-books; educational lesson reader) httpx"
)
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"}
# A school app: skip results whose title/description matches these.
BLOCKED = re.compile(
    r"\b(nude|nudity|naked|porn|erotic|sex(ual)?|genital\w*|penis|vagina|breasts?|nsfw|gore|"
    r"corpse|dead body|execution|torture)\b",
    re.I,
)
_TAG = re.compile(r"<[^>]+>")
_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_TTL_S = 24 * 3600


def _text(value: Any, limit: int = 300) -> str:
    raw = html.unescape(_TAG.sub("", str(value or ""))).strip()
    return re.sub(r"\s+", " ", raw)[:limit]


def search_images(query: str, limit: int = 6, timeout_s: float = 8.0) -> list[dict[str, Any]]:
    q = re.sub(r"\s+", " ", query).strip()[:120]
    if not q:
        return []
    key = f"{q.lower()}|{limit}"
    hit = _CACHE.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    params: dict[str, str | int] = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"{q} filetype:bitmap|drawing",
        "gsrnamespace": 6,  # File:
        "gsrlimit": limit * 3,
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": 720,
    }
    try:
        r = httpx.get(API, params=params, headers={"User-Agent": USER_AGENT}, timeout=timeout_s)
        r.raise_for_status()
        pages = (r.json().get("query") or {}).get("pages") or {}
    except (httpx.HTTPError, ValueError):
        return []
    out: list[dict[str, Any]] = []
    for page in sorted(pages.values(), key=lambda p: p.get("index", 0)):
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        title = str(page.get("title", "")).removeprefix("File:")
        description = _text((meta.get("ImageDescription") or {}).get("value"))
        if info.get("mime") not in ALLOWED_MIME or not info.get("thumburl"):
            continue
        if BLOCKED.search(f"{title} {description}"):
            continue
        out.append(
            {
                "title": re.sub(r"\.(jpe?g|png|webp|svg|gif)$", "", title, flags=re.I).replace(
                    "_", " "
                ),
                "thumb_url": info["thumburl"],
                "full_url": info.get("url") or info["thumburl"],
                "source_url": info.get("descriptionurl") or "",
                "description": description,
                "license": _text((meta.get("LicenseShortName") or {}).get("value"), 80),
                "author": _text((meta.get("Artist") or {}).get("value"), 120),
                "width": info.get("thumbwidth"),
                "height": info.get("thumbheight"),
            }
        )
        if len(out) >= limit:
            break
    _CACHE[key] = (time.time() + _TTL_S, out)
    return out
