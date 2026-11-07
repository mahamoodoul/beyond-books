import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type {
  AssessmentContent,
  AssessmentSummary,
  AttemptResult,
  AttemptRow,
  AttemptStart,
  JobOut,
  ReviewItem,
  StudentAssessment,
  TeacherAssessment,
} from "@/api/generated/schema";

export const useChapterAssessments = (chapterId: string | undefined) =>
  useQuery({
    queryKey: ["assessments", chapterId],
    queryFn: () => api.get<AssessmentSummary[]>(`/chapters/${chapterId}/assessments`),
    enabled: !!chapterId,
  });

export const useTeacherAssessment = (id: string) =>
  useQuery({ queryKey: ["assessment", id], queryFn: () => api.get<TeacherAssessment>(`/assessments/${id}`) });

export const useStudentAssessment = (id: string) =>
  useQuery({ queryKey: ["assessment", id], queryFn: () => api.get<StudentAssessment>(`/assessments/${id}`), enabled: !!id });

export const useAttempt = (id: string) =>
  useQuery({ queryKey: ["attempt", id], queryFn: () => api.get<AttemptResult>(`/attempts/${id}`) });

export const useMyAttempts = (id: string) =>
  useQuery({ queryKey: ["my-attempts", id], queryFn: () => api.get<AttemptRow[]>(`/assessments/${id}/my-attempts`) });

export const useAttempts = (id: string) =>
  useQuery({ queryKey: ["attempts", id], queryFn: () => api.get<AttemptRow[]>(`/assessments/${id}/attempts`) });

export const useReviewQueue = (id: string) =>
  useQuery({ queryKey: ["review-queue", id], queryFn: () => api.get<ReviewItem[]>(`/assessments/${id}/review-queue`) });

export function useAssessmentMutations(id: string) {
  const qc = useQueryClient();
  const set = (a: TeacherAssessment) => {
    qc.setQueryData(["assessment", id], a);
    void qc.invalidateQueries({ queryKey: ["assessments", a.chapter_id] });
  };
  return {
    settings: useMutation({
      mutationFn: (b: { title?: string; passing_score?: number; max_attempts?: number }) => api.patch<TeacherAssessment>(`/assessments/${id}`, b),
      onSuccess: set,
    }),
    questions: useMutation({
      mutationFn: (b: { expected_version: number; content: AssessmentContent }) => api.put<TeacherAssessment>(`/assessments/${id}/questions`, b),
      onSuccess: set,
    }),
    publish: useMutation({ mutationFn: () => api.post<TeacherAssessment>(`/assessments/${id}/publish`), onSuccess: set }),
    unpublish: useMutation({ mutationFn: () => api.post<TeacherAssessment>(`/assessments/${id}/unpublish`), onSuccess: set }),
  };
}

export const startAttempt = (id: string) => api.post<AttemptStart>(`/assessments/${id}/attempts`);
export const explainFurther = (answerId: string) => api.post<JobOut>(`/answers/${answerId}/explain-further`);
