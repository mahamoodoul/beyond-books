"""Model tuning for the 3D generators (``llm`` and ``blender`` providers).

The *tuning prompt* is the quality bar the AI is held to (realism, materials, selectable parts,
animations, validation...). It is prepended to the generator's built-in prompt, which stays in
charge of the mechanics: tools, workspace rules, sizing, and the exact output format.

Where it comes from, in order:

1. ``EDU3D_THREE_D_TUNING_PROMPT`` (inline text) when set;
2. the file named by ``EDU3D_THREE_D_TUNING_PROMPT_FILE`` when set;
3. the built-in default, ``tuning/three_d_model.md`` next to this module.

``EDU3D_THREE_D_TUNING_ENABLED=false`` turns the tuning off (built-in prompt only).

The text is read every time a provider is built (once per generation job), so editing the file
takes effect on the next job without a restart. A hash of the tuning text is appended to the
prompt version stored with each job, so outputs stay traceable to the exact wording used.
"""

import hashlib
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from app.modules.ai_engine.prompts import PromptTemplate

if TYPE_CHECKING:
    from app.core.config import Settings

log = logging.getLogger(__name__)

DEFAULT_TUNING_FILE = Path(__file__).with_name("tuning") / "three_d_model.md"

_BRIDGE = (
    "The build contract below defines the tools you have, the workspace rules, the sizing and "
    "the exact final output. Follow the model tuning notes above for quality and depth; where "
    "they ask for something the contract forbids or cannot export (files, network, imports, "
    "image textures, exporting yourself, a different final answer), the contract wins."
)


def three_d_tuning_text(settings: "Settings") -> str:
    """The tuning prompt in force, or "" when disabled or unreadable."""
    if not settings.three_d_tuning_enabled:
        return ""
    inline = settings.three_d_tuning_prompt.strip()
    if inline:
        return inline
    path = (
        Path(settings.three_d_tuning_prompt_file) if settings.three_d_tuning_prompt_file else None
    )
    try:
        return (path or DEFAULT_TUNING_FILE).read_text(encoding="utf-8").strip()
    except OSError as exc:
        log.warning(
            "3D tuning prompt file %s not readable (%s); using built-in prompt only", path, exc
        )
        return ""


def tuning_ref(text: str) -> str:
    """Short, stable id of a tuning text for the stored prompt version."""
    return "tuning." + hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def three_d_system_prompt(base: PromptTemplate, settings: "Settings") -> tuple[str, str]:
    """Compose (system prompt, prompt version ref) for a 3D generator.

    With tuning: ``<model_tuning>…</model_tuning>`` + bridge + the base prompt, and the ref is
    ``<id>@<version>+tuning.<hash>``. Without: the base prompt and its own ref, unchanged.
    """
    tuning = three_d_tuning_text(settings)
    if not tuning:
        return base.system, base.ref
    system = f"<model_tuning>\n{tuning}\n</model_tuning>\n\n{_BRIDGE}\n\n{base.system}"
    return system, f"{base.ref}+{tuning_ref(tuning)}"
