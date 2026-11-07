import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobOut } from "@/api/generated/schema";
import { api } from "@/api/client";
import { createCourse, getTeacherCourses, uploadSource, waitForJob } from "./api";
vi.mock("@/api/client", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const job = (status: string, extra: Partial<JobOut> = {}) => ({ id: "job-1", status, ...extra }) as JobOut;
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("live course and source API", () => {
  it("creates a backend course and lists manageable courses", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "saved-course" });
    await createCourse({ title: "Physics" });
    expect(api.post).toHaveBeenCalledWith("/courses", { title: "Physics" });
    vi.mocked(api.get).mockResolvedValue([{ id: "owned", can_manage: true }, { id: "enrolled", can_manage: false }]);
    expect(await getTeacherCourses()).toEqual([{ id: "owned", can_manage: true }]);
  });
  it("sends actual file bytes before requesting extraction", async () => {
    const file = new File(["Lesson source"], "source.txt", { type: "text/plain" });
    const upload = { url: "/api/v1/storage/upload", method: "PUT", headers: { "Content-Type": "text/plain" } };
    vi.mocked(api.post).mockResolvedValueOnce({ document: { id: "doc-1" }, upload }).mockResolvedValueOnce({ job: job("queued") });
    const transfer = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transfer);
    await uploadSource("course-1", file);
    expect(api.post).toHaveBeenNthCalledWith(1, "/documents/upload-url", { course_id: "course-1", filename: "source.txt", mime_type: "text/plain", size_bytes: file.size });
    expect(transfer).toHaveBeenCalledWith(upload.url, { method: "PUT", body: file, headers: { ...upload.headers, "X-Requested-With": "edu3d" }, credentials: "include" });
    expect(api.post).toHaveBeenNthCalledWith(2, "/documents/doc-1/complete");
  });
  it("keeps credentials away from external signed uploads", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ document: { id: "doc-1" }, upload: { url: "https://storage.example/upload", method: "PUT", headers: {} } }).mockResolvedValueOnce({ job: job("completed") });
    const transfer = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transfer);
    await uploadSource("course-1", new File(["%PDF"], "lesson.pdf"));
    expect(transfer.mock.calls[0]![1]).toMatchObject({ credentials: "omit", headers: {} });
  });
  it("does not start extraction when file transfer fails", async () => {
    vi.mocked(api.post).mockResolvedValue({ document: { id: "doc-1" }, upload: { url: "/upload", method: "PUT", headers: {} } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 413 })));
    await expect(uploadSource("course-1", new File(["text"], "lesson.txt"))).rejects.toThrow("Upload failed");
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it("waits for real worker completion and reports job failures", async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValueOnce(job("running")).mockResolvedValueOnce(job("completed"));
    const result = waitForJob(job("queued"));
    await vi.advanceTimersByTimeAsync(3000);
    expect((await result).status).toBe("completed");
    expect(api.get).toHaveBeenCalledTimes(2);
    await expect(waitForJob(job("failed", { error_message: "No extractable text" }))).rejects.toThrow("No extractable text");
  });
});
