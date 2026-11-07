import { lazy, Suspense } from "react";

import { Loading } from "@/components/feedback";

const SceneViewer = lazy(() => import("./components/SceneViewer"));

export function LazySceneViewer(props: { sceneId: string; height?: number }) {
  return (
    <Suspense fallback={<Loading label="Loading 3D viewer…" />}>
      <SceneViewer {...props} />
    </Suspense>
  );
}
