import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AnimationRunner, deriveFrame, validateAnimation } from "../runtime/animation";
import type { AnimationSpec, AnimationStep } from "../runtime/types";

const FIXTURES = join(__dirname, "../../../../../../packages/three-d-contracts/fixtures");
const load = <T>(f: string): T => JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as T;

const steps: AnimationStep[] = [
  { step: 1, action: "highlight_component", target_component: "a", duration_ms: 1000 },
  { step: 2, action: "set_opacity", target_component: "b", opacity: 0, duration_ms: 1000 },
  { step: 3, action: "rotate_component", target_component: "a", axis: "y", degrees: 180, duration_ms: 1000 },
  { step: 4, action: "wait", duration_ms: 0 },
  { step: 5, action: "show_annotation", explanation: "done", duration_ms: 500 },
];
const anim: AnimationSpec = { animation_id: "t", title: "T", steps: steps as AnimationSpec["steps"] };

describe("validateAnimation", () => {
  it("accepts every contract fixture against its own scene", () => {
    const pairs: [string, string, Record<string, [number, number, number][]>][] = [
      ["animation_plant_cell_tour_01.json", "scene_plant_cell_01.json", {}],
      ["animation_water_shape_01.json", "scene_water_molecule_01.json", {}],
    ];
    for (const [a, s, paths] of pairs) {
      const scene = load<{ components: { component_id: string }[] }>(s);
      const ids = new Set(scene.components.map((c) => c.component_id));
      expect(validateAnimation(load<AnimationSpec>(a), ids, paths)).toEqual([]);
    }
  });

  it("rejects unknown actions, targets, paths and out-of-range values", () => {
    const bad = {
      animation_id: "x",
      title: "x",
      steps: [
        { step: 1, action: "run_script", duration_ms: 10 },
        { step: 3, action: "highlight_component", target_component: "ghost", duration_ms: 10 },
        { step: 3, action: "show_flow_particles", target_component: "a", path_id: "p", duration_ms: 99_999 },
        { step: 4, action: "set_opacity", target_component: "a", opacity: 2, duration_ms: 1 },
      ],
    } as unknown as AnimationSpec;
    const problems = validateAnimation(bad, new Set(["a"]), {});
    expect(problems.join("\n")).toMatch(/unsupported action "run_script"/);
    expect(problems.join("\n")).toMatch(/unknown target component "ghost"/);
    expect(problems.join("\n")).toMatch(/unknown path "p"/);
    expect(problems.join("\n")).toMatch(/duration_ms/);
    expect(problems.join("\n")).toMatch(/opacity/);
    expect(problems.join("\n")).toMatch(/numbered consecutively/);
  });

  it("is happy with the test animation", () => {
    expect(validateAnimation(anim, new Set(["a", "b"]), {})).toEqual([]);
  });
});

describe("AnimationRunner", () => {
  it("plays through steps, skips zero-length ones and finishes", () => {
    const r = new AnimationRunner(steps);
    expect(r.position.status).toBe("idle");
    r.tick(5000);
    expect(r.position.status).toBe("idle"); // not started
    r.play();
    r.tick(1500);
    expect(r.position).toMatchObject({ index: 1, status: "playing" });
    expect(r.position.progress).toBeCloseTo(0.5);
    r.tick(2000); // through step 3 and the zero-length wait into step 5
    expect(r.position.index).toBe(4);
    r.tick(1000);
    expect(r.position.status).toBe("finished");
    r.play(); // play after finish restarts
    expect(r.position).toMatchObject({ index: 0, status: "playing" });
  });

  it("pauses, resumes and steps", () => {
    const r = new AnimationRunner(steps);
    r.play();
    r.tick(400);
    r.pause();
    r.tick(5000);
    expect(r.position).toMatchObject({ index: 0, status: "paused" });
    r.stepForward();
    expect(r.position).toMatchObject({ index: 1, status: "paused", progress: 1 });
    r.stepBack();
    expect(r.position.index).toBe(0);
    r.play();
    expect(r.position.status).toBe("playing");
  });

  it("notifies subscribers with stable snapshots", () => {
    const r = new AnimationRunner(steps);
    let calls = 0;
    r.subscribe(() => calls++);
    const before = r.getSnapshot();
    r.tick(10);
    expect(r.getSnapshot()).toBe(before);
    r.play();
    expect(calls).toBe(1);
    expect(r.getSnapshot()).not.toBe(before);
  });
});

describe("deriveFrame", () => {
  it("applies completed steps, tweens the current one and keeps transient effects scoped", () => {
    const mid = deriveFrame(steps, { status: "playing", index: 1, progress: 0.5 }, {});
    expect(mid.highlight).toBeNull();
    expect(mid.components.b?.opacity).toBeCloseTo(0.5);

    const rot = deriveFrame(steps, { status: "playing", index: 2, progress: 1 }, {});
    expect(rot.components.b?.opacity).toBe(0);
    expect(rot.components.a?.rotation?.[1]).toBeCloseTo(Math.PI);

    const first = deriveFrame(steps, { status: "playing", index: 0, progress: 0.2 }, {});
    expect(first.highlight).toBe("a");

    const last = deriveFrame(steps, { status: "playing", index: 4, progress: 0.1 }, {});
    expect(last.annotation?.text).toBe("done");

    const done = deriveFrame(steps, { status: "finished", index: 4, progress: 1 }, {});
    expect(done.annotation).toBeNull();
    expect(done.components.a?.rotation?.[1]).toBeCloseTo(Math.PI);
  });

  it("jumps tweens to their end state with reduced motion", () => {
    const f = deriveFrame(steps, { status: "playing", index: 1, progress: 0.1 }, {}, true);
    expect(f.components.b?.opacity).toBe(0);
  });

  it("moves along paths relative to the path start", () => {
    const path: AnimationStep[] = [
      { step: 1, action: "move_along_path", target_component: "a", path_id: "p", duration_ms: 100 },
    ];
    const f = deriveFrame(path, { status: "playing", index: 0, progress: 1 }, {
      p: [
        [1, 0, 0],
        [3, 0, 0],
      ],
    });
    expect(f.components.a?.translation).toEqual([2, 0, 0]);
  });

  it("is empty before the animation starts", () => {
    expect(deriveFrame(steps, { status: "idle", index: 0, progress: 0 }, {}).active).toBe(false);
  });
});

describe("play_clip", () => {
  const clipSteps: AnimationStep[] = [
    { step: 1, action: "highlight_component", target_component: "a", duration_ms: 1000 },
    { step: 2, action: "play_clip", clip: "cycle", loop: true, speed: 2, duration_ms: 0 },
    { step: 3, action: "highlight_component", target_component: "a", duration_ms: 2000 },
  ];

  it("validates clip name and speed", () => {
    expect(validateAnimation({ animation_id: "x", title: "x", steps: clipSteps } as AnimationSpec, new Set(["a"]), {})).toEqual([]);
    const bad: AnimationStep[] = [{ step: 1, action: "play_clip", clip: "Bad Name", speed: 9, duration_ms: 0 }];
    expect(validateAnimation({ animation_id: "x", title: "x", steps: bad } as AnimationSpec, new Set(), {})).toHaveLength(2);
  });

  it("keeps the clip running through later steps, on the timeline's clock", () => {
    expect(deriveFrame(clipSteps, { status: "playing", index: 0, progress: 0.5 }, {}).clip).toBeNull();
    const f = deriveFrame(clipSteps, { status: "playing", index: 2, progress: 0.5 }, {});
    expect(f.clip).toEqual({ name: "cycle", time: 2, loop: true }); // 1000 ms x speed 2
    expect(f.highlight).toBe("a");
  });

  it("stops at the end and under reduced motion", () => {
    expect(deriveFrame(clipSteps, { status: "finished", index: 2, progress: 1 }, {}).clip).toBeNull();
    expect(deriveFrame(clipSteps, { status: "playing", index: 2, progress: 0.5 }, {}, true).clip).toBeNull();
  });
});
