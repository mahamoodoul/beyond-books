import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("authenticated API client", () => {
  it("sends cookie credentials and CSRF headers when saving content", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: "course" }));
    vi.stubGlobal("fetch", fetcher);
    await api.patch("/courses/course", { title: "Saved title" });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/courses/course", expect.objectContaining({ method: "PATCH", credentials: "include", body: JSON.stringify({ title: "Saved title" }), headers: { "Content-Type": "application/json", "X-Requested-With": "edu3d" } }));
  });
  it("refreshes expired sessions once and retries the original request", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({ id: "me" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await api.get("/users/me")).toEqual({ id: "me" });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/v1/users/me", "/api/v1/auth/refresh", "/api/v1/users/me"]);
  });
  it("reports rejected logins without refreshing or bypassing authentication", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: { code: "BAD_CREDENTIALS", message: "Incorrect email or password", request_id: null, details: [] } }, 401));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.post("/auth/login", { email: "wrong@example.test", password: "incorrect" })).rejects.toMatchObject({ name: "ApiError", status: 401, message: "Incorrect email or password" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("propagates server validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "VALIDATION_ERROR", message: "Source is not ready", request_id: "request-1", details: [] } }, 409)));
    await expect(api.post("/courses/course/ai/outline")).rejects.toBeInstanceOf(ApiError);
  });
});
