"""3D model tuning: the configurable quality prompt prepended to both 3D generators."""

from pathlib import Path

from app.core.config import Settings
from app.integrations import providers
from app.modules.ai_engine import model_tuning
from app.modules.ai_engine.prompts import BLENDER_BUILD, THREE_D_MODEL_DESIGN

DEFAULT_PHRASE = "Senior Blender Python"  # from tuning/three_d_model.md


def test_default_tuning_file_ships_and_is_used() -> None:
    assert model_tuning.DEFAULT_TUNING_FILE.is_file()
    system, ref = model_tuning.three_d_system_prompt(BLENDER_BUILD, Settings())  # type: ignore[call-arg]
    assert system.startswith("<model_tuning>\n")
    assert DEFAULT_PHRASE in system
    # The built-in contract (tools, workspace rules, output format) is kept after the tuning.
    assert BLENDER_BUILD.system in system
    assert system.index("</model_tuning>") < system.index(BLENDER_BUILD.system)
    assert ref.startswith(BLENDER_BUILD.ref + "+tuning.") and len(ref.split("+tuning.")[1]) == 8


def test_inline_prompt_wins_over_file_and_changes_the_ref(tmp_path: Path) -> None:
    f = tmp_path / "mine.md"
    f.write_text("FROM FILE", encoding="utf-8")
    by_file = Settings(three_d_tuning_prompt_file=str(f))  # type: ignore[call-arg]
    inline = Settings(  # type: ignore[call-arg]
        three_d_tuning_prompt_file=str(f), three_d_tuning_prompt="FROM INLINE"
    )
    s1, r1 = model_tuning.three_d_system_prompt(THREE_D_MODEL_DESIGN, by_file)
    s2, r2 = model_tuning.three_d_system_prompt(THREE_D_MODEL_DESIGN, inline)
    assert "FROM FILE" in s1 and DEFAULT_PHRASE not in s1
    assert "FROM INLINE" in s2 and "FROM FILE" not in s2
    assert r1 != r2 and r1.startswith(THREE_D_MODEL_DESIGN.ref + "+tuning.")


def test_disabled_or_missing_file_falls_back_to_the_built_in_prompt(tmp_path: Path) -> None:
    off = Settings(three_d_tuning_enabled=False)  # type: ignore[call-arg]
    assert model_tuning.three_d_system_prompt(BLENDER_BUILD, off) == (
        BLENDER_BUILD.system,
        BLENDER_BUILD.ref,
    )
    missing = Settings(three_d_tuning_prompt_file=str(tmp_path / "nope.md"))  # type: ignore[call-arg]
    assert model_tuning.three_d_system_prompt(BLENDER_BUILD, missing) == (
        BLENDER_BUILD.system,
        BLENDER_BUILD.ref,
    )


def test_llm_generator_receives_the_tuned_prompt() -> None:
    p = providers.build_three_d(Settings(three_d_provider="llm"))  # type: ignore[call-arg]
    assert p.name == "llm"
    assert DEFAULT_PHRASE in p.system_prompt  # type: ignore[attr-defined]
    assert THREE_D_MODEL_DESIGN.system in p.system_prompt  # type: ignore[attr-defined]
    assert p.prompt_ref.startswith(THREE_D_MODEL_DESIGN.ref + "+tuning.")  # type: ignore[attr-defined]


def test_blender_generator_receives_the_tuned_prompt_and_its_own_effort() -> None:
    s = Settings(  # type: ignore[call-arg]
        anthropic_api_key="k", anthropic_effort="low", three_d_effort="xhigh"
    )
    p = providers.build_three_d(s, "blender")
    assert DEFAULT_PHRASE in p.system_prompt  # type: ignore[attr-defined]
    assert BLENDER_BUILD.system in p.system_prompt  # type: ignore[attr-defined]
    assert p.effort == "xhigh"  # type: ignore[attr-defined]
    default = providers.build_three_d(Settings(anthropic_api_key="k"), "blender")  # type: ignore[call-arg]
    assert default.effort == "medium"  # type: ignore[attr-defined]


def test_file_edits_apply_to_the_next_job_without_restart(tmp_path: Path) -> None:
    f = tmp_path / "live.md"
    f.write_text("v1", encoding="utf-8")
    s = Settings(three_d_provider="llm", three_d_tuning_prompt_file=str(f))  # type: ignore[call-arg]
    first = providers.build_three_d(s).prompt_ref  # type: ignore[attr-defined]
    f.write_text("v2", encoding="utf-8")
    assert providers.build_three_d(s).prompt_ref != first  # type: ignore[attr-defined]
