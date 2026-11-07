import { useEffect, useState } from "react";

import { ErrorAlert } from "@/components/feedback";
import { Button, Input } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

import { useRegenerateSection } from "./api";

export function RegenerateSection({
  lessonId,
  index,
  version,
  disabled,
  onDone,
}: {
  lessonId: string;
  index: number;
  version: number;
  disabled: boolean;
  onDone: () => void;
}) {
  const regen = useRegenerateSection(lessonId);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const running = regen.isPending || (!!job.data && !["completed", "failed"].includes(job.data.status));

  useEffect(() => {
    if (job.data?.status === "completed") {
      setOpen(false);
      setJobId(null);
      onDone();
    }
  }, [job.data?.status, onDone]);

  if (!open)
    return (
      <Button variant="ghost" disabled={disabled} title={disabled ? "Save your changes first" : undefined} onClick={() => setOpen(true)}>
        ✦ Regenerate
      </Button>
    );
  return (
    <div className="mt-2 w-full space-y-2 rounded-md bg-blue-50 p-3">
      <Input placeholder="Optional instruction, e.g. “use simpler words”" maxLength={500} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button disabled={running} onClick={() => regen.mutate({ index, expected_version: version, instruction }, { onSuccess: (j) => setJobId(j.id) })}>
          {running ? "Regenerating…" : "Regenerate section"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <JobStatusLine job={job.data} label="" />
      </div>
      <ErrorAlert error={regen.error} />
    </div>
  );
}
