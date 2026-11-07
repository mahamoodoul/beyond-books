import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type {
  AssessmentSummary,
  ChapterDetail,
  CourseOut,
  CourseOutline,
  JobOut,
  ResolvedScene,
  SceneOut,
  SceneSpec,
  TeacherAssessment,
} from "@/api/generated/schema";
import { useLesson } from "@/features/lessons/api";

export function useStudioData(lessonId: string) {
  const lesson = useLesson(lessonId);
  const chapter = useQuery({
    queryKey: ["chapter", lesson.data?.chapter_id],
    queryFn: () => api.get<ChapterDetail>(`/chapters/${lesson.data?.chapter_id}`),
    enabled: !!lesson.data,
  });
  const courseId = chapter.data?.course_id;
  const course = useQuery({ queryKey: ["course", courseId], queryFn: () => api.get<CourseOut>(`/courses/${courseId}`), enabled: !!courseId });
  const outline = useQuery({ queryKey: ["outline", courseId], queryFn: () => api.get<CourseOutline>(`/courses/${courseId}/outline`), enabled: !!courseId });
  const scenes = useQuery({ queryKey: ["scenes", lessonId], queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`) });
  return { lesson, chapter, course, outline, scenes };
}

export const useResolved = (sceneId: string | undefined) =>
  useQuery({
    queryKey: ["scene-resolved", sceneId],
    queryFn: () => api.get<ResolvedScene>(`/scenes/${sceneId}/resolved`),
    enabled: !!sceneId,
    staleTime: 5 * 60_000,
  });

export function useSaveSpec(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { scene: SceneOut; spec: SceneSpec }) =>
      api.patch<SceneOut>(`/scenes/${b.scene.id}`, { expected_version: b.scene.version, spec: b.spec }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["scenes", lessonId] });
      void qc.invalidateQueries({ queryKey: ["scene-resolved", s.id] });
    },
  });
}

export function usePublishScene(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<SceneOut>(`/scenes/${id}/publish`),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["scenes", lessonId] });
      void qc.invalidateQueries({ queryKey: ["scene-resolved", s.id] });
    },
  });
}

export type InsightAction = "explain_deeper" | "simplify" | "compare" | "quiz_question";
export const startInsight = (sceneId: string, body: { component_id: string; action: InsightAction; compare_with?: string }) =>
  api.post<JobOut>(`/scenes/${sceneId}/ai/part-insight`, body);

export interface QuizQuestion {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

/** Append an AI question to the chapter's first assessment (created if none exists). */
export async function addQuestionToChapterQuiz(chapterId: string, q: QuizQuestion): Promise<TeacherAssessment> {
  const list = await api.get<AssessmentSummary[]>(`/chapters/${chapterId}/assessments`);
  const target = list[0]
    ? await api.get<TeacherAssessment>(`/assessments/${list[0].id}`)
    : await api.post<TeacherAssessment>(`/chapters/${chapterId}/assessments`, { title: "Chapter quiz" });
  const questions = [
    ...(target.content.questions ?? []),
    {
      question_type: "mcq" as const,
      question_text: q.question_text,
      points: 1,
      difficulty: "medium" as const,
      explanation_correct: q.explanation,
      explanation_general: q.explanation,
      options: q.options.map((text, i) => ({ text, is_correct: i === q.correct_index })),
    },
  ];
  return api.put<TeacherAssessment>(`/assessments/${target.id}/questions`, {
    expected_version: target.version,
    content: { ...target.content, questions },
  });
}
