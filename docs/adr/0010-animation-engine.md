# ADR 0010: Animation engine

- **Status:** Proposed — Phase 6; review with 3D (Dev 4) and AI (Dev 3)
- **Date:** 2026-11-07

## Decision

- Animations are validated `AnimationSpec` documents stored per scene (`three_d_animations`);
  steps live in the spec (the design's `animation_steps` table can be derived for analytics).
- Contract addition: `SceneSpec.paths` — named polylines (2–200 points, |coord| ≤ 1000) used by
  `move_along_path` and `show_flow_particles`. Animations are rejected if they target unknown
  components or paths. Creating an animation adds it to the scene's `animation_refs`.
- Animations are published **with the scene**: publishing validates every referenced animation
  against the scene and snapshots them into `published_animations`; students play the snapshot.
- Runtime (`AnimationLayer`): every frame restore the baseline of touched objects, then apply steps
  0..n (completed fully, current by progress). Supports play, pause, restart, step back/forward,
  jump; `prefers-reduced-motion` disables autoplay and tweening.
- Action semantics: `highlight_component` and `camera_focus` apply to the current step only;
  visibility, opacity and rotation accumulate; `move_along_path` moves a marker (not the
  component); `show_flow_particles` animates particles along the path; `show_annotation` shows its
  text in the step panel.
- AI Animation Planning agent produces steps from the lesson and the scene's components/paths;
  invalid steps are dropped, values clamped; saved as a draft animation (`origin=ai`).
