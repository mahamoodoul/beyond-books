import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "./client";

export interface HealthResponse {
  status: string;
  environment: string;
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/health"),
    retry: false,
  });
}
