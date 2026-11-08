/**
 * Animation engine (design §7.6). Animations are validated data: a closed set of actions with
 * bounded parameters. Nothing here executes content from the spec.
 *
 *  validateAnimation  mirrors the backend contract + validate_animation_for_scene
 *  AnimationRunner    timeline state machine: play / pause / resume / restart / step
 *  deriveFrame        pure: (steps, position) -> what every component should look like now
 */
import { samplePath } from "./paths";
import type { AnimationSpec, AnimationStep, Vec3 } from "./types";

export const MAX_STEP_DURATION_MS = 30_000;
export const SUPPORTED_ACTIONS = [
  "highlight_component",
  "set_visibility",
  "set_opacity",
  "move_along_path",
  "rotate_component",
  "show_flow_particles",
  "camera_focus",
  "show_annotation",
  "wait",
  "play_clip",
] as const satisfies readonly AnimationStep["action"][];

const SUPPORTED: ReadonlySet<string> = new Set(SUPPORTED_ACTIONS);

export function validateAnimation(
  anim: AnimationSpec,
  componentIds: ReadonlySet<string>,
  paths: Readonly<Record<string, readonly Vec3[]>>,
): string[] {
  const problems: string[] = [];
  if (anim.schema_version !== undefined && anim.schema_version !== "1.0") {
    problems.push(`unsupported animation schema_version ${String(anim.schema_version)}`);
  }
  if (!Array.isArray(anim.steps) || anim.steps.length === 0) {
    return [...problems, "animation has no steps"];
  }
  if (anim.steps.length > 200) problems.push("animation has more than 200 steps");
  anim.steps.forEach((s, i) => {
    const where = `step ${i + 1}`;
    if (s.step !== i + 1) problems.push(`${where}: steps must be numbered consecutively from 1`);
    if (!SUPPORTED.has(s.action)) {
      problems.push(`${where}: unsupported action "${String(s.action)}"`);
      return;
    }
    if (!(s.duration_ms >= 0 && s.duration_ms <= MAX_STEP_DURATION_MS)) {
      problems.push(`${where}: duration_ms must be 0..${MAX_STEP_DURATION_MS}`);
    }
    const target = "target_component" in s ? s.target_component : null;
    if (target != null && !componentIds.has(target)) {
      problems.push(`${where}: unknown target component "${target}"`);
    }
    if ("path_id" in s && !(s.path_id in paths)) {
      problems.push(`${where}: unknown path "${s.path_id}"`);
    }
    if (s.action === "set_opacity" && !(s.opacity >= 0 && s.opacity <= 1)) {
      problems.push(`${where}: opacity must be 0..1`);
    }
    if (s.action === "rotate_component" && !(Math.abs(s.degrees) <= 720)) {
      problems.push(`${where}: degrees must be -720..720`);
    }
    if (s.action === "play_clip") {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(s.clip ?? "")) problems.push(`${where}: invalid clip name`);
      const speed = s.speed ?? 1;
      if (!(speed >= 0.1 && speed <= 4)) problems.push(`${where}: speed must be 0.1..4`);
    }
  });
  return problems;
}

// ------------------------------------------------------------------------ runner

export type RunnerStatus = "idle" | "playing" | "paused" | "finished";

export interface RunnerSnapshot {
  status: RunnerStatus;
  index: number;
  progress: number;
}

export class AnimationRunner {
  private index = 0;
  private elapsed = 0;
  private status: RunnerStatus = "idle";
  private listeners = new Set<() => void>();
  private snapshot: RunnerSnapshot = { status: "idle", index: 0, progress: 0 };

  constructor(readonly steps: readonly AnimationStep[]) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Stable between changes of status or step, for useSyncExternalStore. */
  getSnapshot = (): RunnerSnapshot => this.snapshot;

  get position(): RunnerSnapshot {
    return { status: this.status, index: this.index, progress: this.progress };
  }

  get progress(): number {
    const d = this.steps[this.index]?.duration_ms ?? 0;
    if (this.status === "finished") return 1;
    return d === 0 ? (this.elapsed > 0 ? 1 : 0) : Math.min(this.elapsed / d, 1);
  }

  play(): void {
    if (this.steps.length === 0) return;
    if (this.status === "finished") {
      this.index = 0;
      this.elapsed = 0;
    }
    this.status = "playing";
    this.emit();
  }

  pause(): void {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.emit();
  }

  restart(): void {
    this.index = 0;
    this.elapsed = 0;
    this.status = this.steps.length ? "playing" : "idle";
    this.emit();
  }

  /** Back to the scene's resting state, no animation effects applied. */
  reset(): void {
    this.index = 0;
    this.elapsed = 0;
    this.status = "idle";
    this.emit();
  }

  /** Show the next step in its completed state and pause there (manual, reduced-motion use). */
  stepForward(): void {
    if (this.steps.length === 0) return;
    if (this.status === "idle") {
      this.status = "paused";
      this.elapsed = this.steps[0]?.duration_ms ?? 0;
    } else if (this.index < this.steps.length - 1) {
      this.index += 1;
      this.elapsed = this.steps[this.index]?.duration_ms ?? 0;
      this.status = "paused";
    } else {
      this.status = "finished";
    }
    this.emit();
  }

  stepBack(): void {
    if (this.steps.length === 0) return;
    this.index = Math.max(0, this.index - 1);
    this.elapsed = this.steps[this.index]?.duration_ms ?? 0;
    this.status = "paused";
    this.emit();
  }

  /** Advance by `dtMs`. Returns true when the step index or status changed. */
  tick(dtMs: number): boolean {
    if (this.status !== "playing") return false;
    this.elapsed += Math.max(0, dtMs);
    let changed = false;
    for (;;) {
      const d = this.steps[this.index]?.duration_ms ?? 0;
      if (this.elapsed < d) break;
      if (this.index >= this.steps.length - 1) {
        this.elapsed = d;
        this.status = "finished";
        changed = true;
        break;
      }
      this.elapsed -= d;
      this.index += 1;
      changed = true;
    }
    if (changed) this.emit();
    return changed;
  }

  private emit(): void {
    this.snapshot = { status: this.status, index: this.index, progress: this.progress };
    for (const fn of this.listeners) fn();
  }
}

// ------------------------------------------------------------------------- frame

export interface ComponentAnimState {
  visible?: boolean;
  opacity?: number;
  /** Extra rotation in radians about the component's own centre, per axis. */
  rotation?: Vec3;
  /** Translation from move_along_path, in asset space. */
  translation?: Vec3;
}

export interface AnimationFrame {
  active: boolean;
  components: Record<string, ComponentAnimState>;
  highlight: string | null;
  flow: { pathId: string; target: string; progress: number } | null;
  /** Latest camera_focus target; `key` changes each time a new focus is issued. */
  focus: { target: string; key: number } | null;
  annotation: { text: string; target: string | null } | null;
  /** A clip baked into the model, at `time` seconds of clip time (see play_clip). */
  clip: { name: string; time: number; loop: boolean } | null;
  explanation: string | null;
  stepNumber: number | null;
}

export const EMPTY_FRAME: AnimationFrame = {
  active: false,
  components: {},
  highlight: null,
  flow: null,
  focus: null,
  annotation: null,
  clip: null,
  explanation: null,
  stepNumber: null,
};

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Cumulative state after all steps before `index` completed and step `index` is at `progress`.
 * With `reducedMotion`, tweens jump to their end state (timing for reading is unchanged).
 */
export function deriveFrame(
  steps: readonly AnimationStep[],
  position: RunnerSnapshot,
  paths: Readonly<Record<string, readonly Vec3[]>>,
  reducedMotion = false,
): AnimationFrame {
  if (position.status === "idle" || steps.length === 0) return EMPTY_FRAME;
  const finished = position.status === "finished";
  const components: Record<string, ComponentAnimState> = {};
  const get = (id: string) => (components[id] ??= {});
  let focus: AnimationFrame["focus"] = null;

  const last = Math.min(position.index, steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const s = steps[i]!;
    const raw = i < last || finished ? 1 : position.progress;
    const p = reducedMotion ? (raw > 0 || s.duration_ms === 0 ? 1 : 0) : ease(raw);
    switch (s.action) {
      case "set_visibility":
        if (p > 0 || s.duration_ms === 0) get(s.target_component).visible = s.visible;
        break;
      case "set_opacity": {
        const c = get(s.target_component);
        const from = c.opacity ?? 1;
        c.opacity = from + (s.opacity - from) * p;
        if (s.opacity > 0) c.visible = c.visible ?? true;
        break;
      }
      case "rotate_component": {
        const c = get(s.target_component);
        const r: Vec3 = c.rotation ? [...c.rotation] : [0, 0, 0];
        const axis = s.axis === "x" ? 0 : s.axis === "y" ? 1 : 2;
        r[axis] += ((s.degrees * Math.PI) / 180) * p;
        c.rotation = r;
        break;
      }
      case "move_along_path": {
        const pts = paths[s.path_id];
        if (pts && pts.length) {
          const start = pts[0]!;
          const at = samplePath(pts, p);
          get(s.target_component).translation = [
            at[0] - start[0],
            at[1] - start[1],
            at[2] - start[2],
          ];
        }
        break;
      }
      case "camera_focus":
        focus = { target: s.target_component, key: i };
        break;
      default:
        break;
    }
  }

  const current = finished ? null : (steps[last] ?? null);
  const progress = position.progress;

  // play_clip: the latest clip keeps running through the later steps. Its time follows the
  // timeline (not the wall clock), so pause, step and restart stay exact. Reduced motion: no clip.
  let clip: AnimationFrame["clip"] = null;
  if (!finished && !reducedMotion) {
    for (let c = last; c >= 0; c--) {
      const s = steps[c]!;
      if (s.action !== "play_clip") continue;
      let ms = 0;
      for (let i = c; i < last; i++) ms += steps[i]!.duration_ms;
      ms += steps[last]!.duration_ms * position.progress;
      clip = { name: s.clip, time: (ms / 1000) * (s.speed ?? 1), loop: s.loop ?? true };
      break;
    }
  }
  return {
    active: true,
    components,
    highlight:
      current && current.action === "highlight_component" ? current.target_component : null,
    flow:
      current && current.action === "show_flow_particles"
        ? { pathId: current.path_id, target: current.target_component, progress }
        : null,
    focus,
    annotation:
      current && current.action === "show_annotation"
        ? { text: current.explanation, target: current.target_component ?? null }
        : null,
    clip,
    explanation: current?.explanation ?? null,
    stepNumber: current?.step ?? null,
  };
}
