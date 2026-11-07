/**
 * Thin fetch wrapper for /api/v1. Every non-2xx response is parsed into the backend's
 * consistent error envelope (design §9) and thrown as ApiError.
 * Generated OpenAPI types will live in ./generated once domain endpoints exist.
 */

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string | null;
    details: unknown[];
  };
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

function isEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const env = isEnvelope(body)
      ? body.error
      : { code: "HTTP_ERROR", message: res.statusText, request_id: null, details: [] };
    throw new ApiError(res.status, env);
  }
  return body as T;
}
