import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { JobOut } from "@/api/generated/schema";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function isTerminal(job: JobOut | undefined): boolean {
  return !!job && TERMINAL.has(job.status);
}

/** Polls a job until it reaches a terminal state (design §10: polling for the MVP). */
export function useJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.get<JobOut>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (isTerminal(q.state.data) ? false : 2000),
  });
}
