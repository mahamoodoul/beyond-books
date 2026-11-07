import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { ChapterDetail, ChapterOut, ChapterUpdate, ObjectiveIn, ObjectiveOut } from "@/api/generated/schema";

export const useChapters = (courseId: string) =>
  useQuery({ queryKey: ["chapters", courseId], queryFn: () => api.get<ChapterOut[]>(`/courses/${courseId}/chapters`) });

export const useChapter = (id: string) =>
  useQuery({ queryKey: ["chapter", id], queryFn: () => api.get<ChapterDetail>(`/chapters/${id}`) });

export function useChapterMutations(courseId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["chapters", courseId] });
  return {
    create: useMutation({
      mutationFn: (body: { title: string; description?: string }) =>
        api.post<ChapterOut>(`/courses/${courseId}/chapters`, body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: ChapterUpdate & { id: string }) => api.patch<ChapterOut>(`/chapters/${id}`, body),
      onSuccess: (c) => {
        void refresh();
        void qc.invalidateQueries({ queryKey: ["chapter", c.id] });
      },
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete<void>(`/chapters/${id}`), onSuccess: refresh }),
  };
}

export function useReplaceObjectives(chapterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (objectives: ObjectiveIn[]) => api.put<ObjectiveOut[]>(`/chapters/${chapterId}/objectives`, objectives),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chapter", chapterId] }),
  });
}
