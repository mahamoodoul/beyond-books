import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { CourseOutline, CourseProgressSummary, EventIn, LessonProgressOut } from "@/api/generated/schema";

export const useMyProgress = () =>
  useQuery({ queryKey: ["my-progress"], queryFn: () => api.get<CourseProgressSummary[]>("/students/me/progress") });

export const useOutline = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["outline", courseId],
    queryFn: () => api.get<CourseOutline>(`/courses/${courseId}/outline`),
    enabled: !!courseId,
  });

export function useSetProgress(courseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { lessonId: string; status: "in_progress" | "completed" }) =>
      api.post<LessonProgressOut | undefined>(`/lessons/${b.lessonId}/progress`, { status: b.status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["outline", courseId] });
      void qc.invalidateQueries({ queryKey: ["my-progress"] });
    },
  });
}

/** Fire-and-forget learning events, batched briefly. Failures never disturb the learner. */
let queue: EventIn[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
export function trackEvent(e: EventIn): void {
  queue.push(e);
  timer ??= setTimeout(() => {
    const events = queue.splice(0, 50);
    timer = null;
    if (events.length) void api.post("/learning-events", { events }).catch(() => undefined);
  }, 1500);
}
