import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { LessonContent, LessonOut, LessonSummary, LessonUpdate } from "@/api/generated/schema";

export const useLessons = (chapterId: string) =>
  useQuery({ queryKey: ["lessons", chapterId], queryFn: () => api.get<LessonSummary[]>(`/chapters/${chapterId}/lessons`) });

export const useLesson = (id: string) =>
  useQuery({ queryKey: ["lesson", id], queryFn: () => api.get<LessonOut>(`/lessons/${id}`) });

export function useCreateLesson(chapterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; content?: LessonContent }) => api.post<LessonOut>(`/chapters/${chapterId}/lessons`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lessons", chapterId] }),
  });
}

export function useLessonMutations(id: string) {
  const qc = useQueryClient();
  const set = (l: LessonOut) => {
    qc.setQueryData(["lesson", id], l);
    void qc.invalidateQueries({ queryKey: ["lessons", l.chapter_id] });
  };
  return {
    save: useMutation({ mutationFn: (body: LessonUpdate) => api.patch<LessonOut>(`/lessons/${id}`, body), onSuccess: set }),
    publish: useMutation({ mutationFn: () => api.post<LessonOut>(`/lessons/${id}/publish`), onSuccess: set }),
    unpublish: useMutation({ mutationFn: () => api.post<LessonOut>(`/lessons/${id}/unpublish`), onSuccess: set }),
  };
}
