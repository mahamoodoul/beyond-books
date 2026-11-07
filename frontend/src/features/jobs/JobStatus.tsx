import type { JobOut } from "@/api/generated/schema";
import { Badge } from "@/components/ui";

const tone = {
  queued: "slate",
  processing: "blue",
  retrying: "amber",
  validating: "blue",
  completed: "green",
  failed: "red",
  cancelled: "slate",
} as const;

export function JobStatusLine({ job, label }: { job: JobOut | undefined; label: string }) {
  if (!job) return null;
  return (
    <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
      <span>{label}</span>
      <Badge tone={tone[job.status as keyof typeof tone] ?? "slate"}>{job.status}</Badge>
      {job.status === "failed" && job.error_message && (
        <span className="text-red-700">{job.error_message}</span>
      )}
    </div>
  );
}
