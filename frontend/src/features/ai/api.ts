import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { AIUsageOut, ChapterOut, JobOut, OutlineProposalOut } from "@/api/generated/schema";

export interface ProposalChapter {
  title: string;
  description: string;
  source_refs: { document_id: string; page_start: number; page_end: number }[];
  objectives: { text: string; source_refs: unknown[] }[];
}
export interface ProposalOutput {
  subject: string;
  level: string;
  chapters: ProposalChapter[];
}
export interface ValidationInfo {
  removed_refs?: number;
  sections_without_sources?: string[];
  warnings?: string[];
}

export const useOutlineProposals = (courseId: string) =>
  useQuery({
    queryKey: ["outline-proposals", courseId],
    queryFn: () => api.get<OutlineProposalOut[]>(`/courses/${courseId}/ai/outline-proposals`),
  });

export const useAIUsage = (courseId: string) =>
  useQuery({ queryKey: ["ai-usage", courseId], queryFn: () => api.get<AIUsageOut>(`/courses/${courseId}/ai/usage`) });

export const useStartOutline = (courseId: string) =>
  useMutation({ mutationFn: () => api.post<JobOut>(`/courses/${courseId}/ai/outline`) });

export const useStartLesson = (chapterId: string) =>
  useMutation({ mutationFn: () => api.post<JobOut>(`/chapters/${chapterId}/ai/lesson`) });

export const useRegenerateSection = (lessonId: string) =>
  useMutation({
    mutationFn: (b: { index: number; expected_version: number; instruction?: string }) =>
      api.post<JobOut>(`/lessons/${lessonId}/ai/sections/${b.index}/regenerate`, {
        expected_version: b.expected_version,
        instruction: b.instruction || null,
      }),
  });

export function useProposalActions(courseId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["outline-proposals", courseId] });
    void qc.invalidateQueries({ queryKey: ["chapters", courseId] });
  };
  return {
    apply: useMutation({
      mutationFn: ({ id, chapters }: { id: string; chapters: unknown[] }) =>
        api.post<ChapterOut[]>(`/ai/outline-proposals/${id}/apply`, { chapters }),
      onSuccess: refresh,
    }),
    discard: useMutation({
      mutationFn: (id: string) => api.post<void>(`/ai/outline-proposals/${id}/discard`),
      onSuccess: refresh,
    }),
  };
}
