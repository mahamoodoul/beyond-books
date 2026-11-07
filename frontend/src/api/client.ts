/**
 * Fetch wrapper for /api/v1.
 * - Sends cookies + the CSRF header the backend requires for state-changing requests.
 * - On 401, tries one silent token refresh and retries the request.
 * - Non-2xx responses are parsed into the backend error envelope and thrown as ApiError.
 * Request/response types come from ./generated/schema.ts (generated from backend OpenAPI).
 */

export interface ErrorEnvelope {
  error: { code: string; message: string; request_id: string | null; details: unknown[] };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: unknown[];

  constructor(status: number, envelope: ErrorEnvelope["error"]) {
    super(envelope.message);
    this.name = "ApiError";
    this.status = status;
    this.code = envelope.code;
    this.requestId = envelope.request_id;
    this.details = envelope.details;
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/register", "/auth/logout"];

function isEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value;
}

async function raw(path: string, init: RequestInit): Promise<Response> {
  const isForm = init.body instanceof FormData || init.body instanceof Blob;
  return fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(isForm || init.body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-Requested-With": "edu3d",
      ...init.headers,
    },
  });
}

let refreshing: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  refreshing ??= raw("/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && !NO_REFRESH.includes(path) && (await refreshOnce())) {
    res = await raw(path, init);
  }
  const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const env = isEnvelope(body)
      ? body.error
      : { code: "HTTP_ERROR", message: res.statusText, request_id: null, details: [] };
    throw new ApiError(res.status, env);
  }
  return body as T;
}

/** POST and return the response body as a Blob (audio, files). Same auth refresh and error envelope as apiFetch. */
export async function apiBlob(path: string, body: unknown): Promise<Blob> {
  const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
  let res = await raw(path, init);
  if (res.status === 401 && (await refreshOnce())) res = await raw(path, init);
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => undefined);
    const env = isEnvelope(parsed)
      ? parsed.error
      : { code: "HTTP_ERROR", message: res.statusText, request_id: null, details: [] };
    throw new ApiError(res.status, env);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
