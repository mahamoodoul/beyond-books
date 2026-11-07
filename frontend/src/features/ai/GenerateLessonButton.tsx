import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ErrorAlert } from "@/components/feedback";
import { Button } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

import { useStartLesson } from "./api";

export function GenerateLessonButton({ chapterId }: { chapterId: string }) {
  const start = useStartLesson(chapterId);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const running = start.isPending || (!!job.data && !["completed", "failed"].includes(job.data.status));

  useEffect(() => {
    const lessonId = job.data?.result?.lesson_id;
    if (job.data?.status === "completed" && typeof lessonId === "string") {
      void qc.invalidateQueries({ queryKey: ["lessons", chapterId] });
      navigate(`/teacher/lessons/${lessonId}`);
    }
  }, [job.data, chapterId, navigate, qc]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={running} onClick={() => start.mutate(undefined, { onSuccess: (j) => setJobId(j.id) })}>
        {running ? "Generating lesson…" : "Generate lesson with AI"}
      </Button>
      <JobStatusLine job={job.data?.status === "completed" ? undefined : job.data} label="" />
      <ErrorAlert error={start.error} />
    </div>
  );
}
