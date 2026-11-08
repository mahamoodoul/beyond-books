import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { LessonMediaOut, ResolvedScene, SceneOut } from "@/api/generated/schema";

/**
 * Where the interactive heart's files come from: all from the backend, like other course data.
 *   - 3D model: the lesson's 3D scene -> its "Interactive Human Heart" library asset (signed URL)
 *   - picture + AR scan target: the lesson's media (`/lessons/{id}/media`, signed URLs)
 * Signed links expire after a few minutes, so they are refetched rather than cached for long.
 */
export const INTERACTIVE_HEART_SLUG = /^interactive_human_heart(_|$)/;
const FRESH = { staleTime: 4 * 60_000, gcTime: 5 * 60_000 } as const;

export function usesInteractiveHeart(scene: SceneOut): boolean {
  return (scene.spec.asset_refs ?? []).some((ref) => INTERACTIVE_HEART_SLUG.test(ref.asset_id));
}

export function useLessonScenes(lessonId: string | undefined) {
  return useQuery({
    queryKey: ["scenes", lessonId],
    queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`),
    enabled: !!lessonId,
  });
}

export function useLessonMedia(lessonId: string | undefined) {
  return useQuery({
    queryKey: ["lesson-media", lessonId],
    queryFn: () => api.get<LessonMediaOut[]>(`/lessons/${lessonId}/media`),
    enabled: !!lessonId,
    ...FRESH,
  });
}

/** Signed URL of the heart model used by the lesson's 3D scene (null while loading / if absent). */
export function useHeartModelUrl(sceneId: string | undefined) {
  return useQuery({
    queryKey: ["scene-resolved", sceneId],
    queryFn: () => api.get<ResolvedScene>(`/scenes/${sceneId}/resolved`),
    enabled: !!sceneId,
    select: (scene) => scene.assets.find((a) => INTERACTIVE_HEART_SLUG.test(a.asset_id))?.url ?? null,
    ...FRESH,
  });
}

export const firstMedia = (media: LessonMediaOut[] | undefined, kind: "image" | "ar_target") =>
  media?.find((m) => m.kind === kind && m.status === "ready" && m.url) ?? null;
