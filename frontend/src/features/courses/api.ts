import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { CourseCreate, CourseOut, CourseUpdate } from "@/api/generated/schema";

export const useCourses = () =>
  useQuery({ queryKey: ["courses"], queryFn: () => api.get<CourseOut[]>("/courses") });

export const useCourse = (id: string) =>
  useQuery({ queryKey: ["course", id], queryFn: () => api.get<CourseOut>(`/courses/${id}`) });

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseCreate) => api.post<CourseOut>("/courses", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useUpdateCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseUpdate) => api.patch<CourseOut>(`/courses/${id}`, body),
    onSuccess: (c) => {
      qc.setQueryData(["course", id], c);
      void qc.invalidateQueries({ queryKey: ["courses"] });
      void qc.invalidateQueries({ queryKey: ["students", id] }); // opening a course enrolls students
    },
  });
}
