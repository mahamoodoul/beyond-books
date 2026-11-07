import { lazy, Suspense } from "react";

import { Loading } from "@/components/feedback";

import type { SceneEvent } from "./components/SceneViewer";

const SceneStudio = lazy(async () => ({ default: (await import("./library/pages/StudentStudio")).SceneStudio }));

/** Studio viewer (focus, X-ray, tour, fullscreen, study cards) for a lesson scene, loaded on demand. */
export function LazySceneStudio(props: { sceneId: string; onEvent?: (e: SceneEvent) => void }) {
  return (
    <Suspense fallback={<Loading label="Loading 3D Studio…" />}>
      <SceneStudio {...props} />
    </Suspense>
  );
}
