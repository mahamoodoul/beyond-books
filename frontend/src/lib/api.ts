/** Live Beyond Books API. All application data is persisted by the backend. */
import { api } from "@/api/client";
import type { ChapterOut, CourseAnalytics, CourseCreate, CourseOut, CourseUpdate, DocumentJobResponse, JobOut, StudentProgressRow, UploadUrlResponse } from "@/api/generated/schema";

export const getTeacherCourses = () => api.get<CourseOut[]>("/courses").then(courses => courses.filter(c => c.can_manage));
export const getCourse = (id: string) => api.get<CourseOut>(`/courses/${id}`);
export const createCourse = (body: CourseCreate) => api.post<CourseOut>("/courses", body);
export const updateCourse = (id: string, body: CourseUpdate) => api.patch<CourseOut>(`/courses/${id}`, body);
export const getClassAnalytics = (id: string) => api.get<CourseAnalytics>(`/courses/${id}/analytics`);
export const getCourseProgress = (id: string) => api.get<StudentProgressRow[]>(`/courses/${id}/progress`);
export const getChapters = (id: string) => api.get<ChapterOut[]>(`/courses/${id}/chapters`);

export function sourceMime(file: File): string {
  const ext = file.name.toLowerCase().split(".").pop();
  const mime = ext === "pdf" ? "application/pdf" : ext === "txt" ? "text/plain" : ext === "md" ? "text/markdown" : null;
  if (!mime) throw new Error("Choose a PDF, text, or Markdown file.");
  return mime;
}

export async function uploadSource(courseId: string, file: File): Promise<DocumentJobResponse> {
  const mime = sourceMime(file);
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error("Choose a non-empty file smaller than 25 MB.");
  const { document, upload } = await api.post<UploadUrlResponse>("/documents/upload-url", {
    course_id: courseId, filename: file.name, mime_type: mime, size_bytes: file.size,
  });
  const target = new URL(upload.url, window.location.origin);
  const sameOrigin = target.origin === window.location.origin;
  const response = await fetch(upload.url, {
    method: upload.method, body: file,
    headers: { ...upload.headers, ...(sameOrigin ? { "X-Requested-With": "edu3d" } : {}) },
    credentials: sameOrigin ? "include" : "omit",
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status}). You can retry from the course's Sources tab.`);
  return api.post<DocumentJobResponse>(`/documents/${document.id}/complete`);
}

/** Returns the real worker result; never substitutes a simulated successful job. */
export async function waitForJob(initial: JobOut, signal?: AbortSignal): Promise<JobOut> {
  let job = initial;
  const deadline = Date.now() + 10 * 60_000;
  while (!["completed", "failed", "cancelled"].includes(job.status)) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) throw new Error("Processing is still running. Open the course to check its status.");
    await new Promise(resolve => setTimeout(resolve, 1500));
    signal?.throwIfAborted();
    job = await api.get<JobOut>(`/jobs/${job.id}`);
  }
  if (job.status !== "completed") throw new Error(job.error_message || `Processing ${job.status}. Open the course to retry.`);
  return job;
}
