import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { LabCreate, LabKindOut, LabOut, LabSummary, LabUpdate, SessionResult, StudentSessionRow } from "@/api/generated/schema";

export const useLabs = () => useQuery({ queryKey: ["labs"], queryFn: () => api.get<LabOut[]>("/labs") });

export const useLabKinds = () => useQuery({ queryKey: ["lab-kinds"], queryFn: () => api.get<LabKindOut[]>("/labs/kinds"), staleTime: Infinity });

export const useLab = (labId: string | undefined) =>
  useQuery({ queryKey: ["lab", labId], queryFn: () => api.get<LabOut>(`/labs/${labId}`), enabled: !!labId });

export const useChapterLabs = (chapterId: string | undefined) =>
  useQuery({
    queryKey: ["chapter-labs", chapterId],
    queryFn: () => api.get<LabSummary[]>(`/chapters/${chapterId}/labs`),
    enabled: !!chapterId,
  });

/** Teacher view of every student's state; polls so the teacher sees updates as they happen. */
export const useLabSessions = (labId: string | undefined, live = true) =>
  useQuery({
    queryKey: ["lab-sessions", labId],
    queryFn: () => api.get<StudentSessionRow[]>(`/labs/${labId}/sessions`),
    enabled: !!labId,
    refetchInterval: live ? 5000 : false,
  });

export function useCreateLab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { courseId: string | null; body: LabCreate }) =>
      b.courseId ? api.post<LabOut>(`/courses/${b.courseId}/labs`, b.body) : api.post<LabOut>("/labs", { ...b.body, course_id: null }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["labs"] }),
  });
}

export function useUpdateLab(labId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LabUpdate) => api.patch<LabOut>(`/labs/${labId}`, body),
    onSuccess: (lab) => {
      qc.setQueryData(["lab", labId], lab);
      void qc.invalidateQueries({ queryKey: ["labs"] });
    },
  });
}

export function useDeleteLab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labId: string) => api.delete<void>(`/labs/${labId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["labs"] }),
  });
}

/** Save the current state (students) or just evaluate it (teachers). */
export function useSaveSession(labId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (state: Record<string, unknown>) => api.put<SessionResult>(`/labs/${labId}/session`, { state }),
    onSuccess: (res) => {
      if (res.session) void qc.invalidateQueries({ queryKey: ["chapter-labs"] });
    },
  });
}
