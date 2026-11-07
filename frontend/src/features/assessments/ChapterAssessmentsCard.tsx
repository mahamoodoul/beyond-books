import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { api } from "@/api/client";
import type { JobOut, TeacherAssessment } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card } from "@/components/ui";
import { JobStatusLine } from "@/features/jobs/JobStatus";
import { useJob } from "@/features/jobs/useJob";

import { useChapterAssessments } from "./api";

export function ChapterAssessmentsCard({ chapterId }: { chapterId: string }) {
  const list = useChapterAssessments(chapterId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => api.post<TeacherAssessment>(`/chapters/${chapterId}/assessments`, { title: "Chapter quiz" }),
    onSuccess: (a) => navigate(`/teacher/assessments/${a.id}`),
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const gen = useMutation({ mutationFn: () => api.post<JobOut>(`/chapters/${chapterId}/ai/assessment`), onSuccess: (j) => setJobId(j.id) });
  useEffect(() => {
    const id = job.data?.result?.assessment_id;
    if (job.data?.status === "completed" && typeof id === "string") {
      void qc.invalidateQueries({ queryKey: ["assessments", chapterId] });
      navigate(`/teacher/assessments/${id}`);
    }
  }, [job.data, chapterId, navigate, qc]);
  const busy = gen.isPending || (!!job.data && !["completed", "failed"].includes(job.data.status));

  return (
    <Card className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Assessments</h2>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => gen.mutate()}>{busy ? "Generating quiz…" : "✦ Generate quiz with AI"}</Button>
          <Button variant="secondary" disabled={create.isPending} onClick={() => create.mutate()}>New quiz</Button>
        </div>
      </div>
      <JobStatusLine job={job.data?.status === "completed" ? undefined : job.data} label="Quiz generation:" />
      <ErrorAlert error={gen.error ?? create.error ?? list.error} />
      {list.isPending && <Loading />}
      {list.data?.length === 0 && <EmptyState title="No assessments yet" />}
      <ul className="divide-y divide-slate-100">
        {list.data?.map((a) => (
          <li key={a.id}>
            <Link to={`/teacher/assessments/${a.id}`} className="flex items-center justify-between py-2 hover:bg-slate-50">
              <span className="font-medium">{a.title} <span className="text-sm font-normal text-slate-500">{a.question_count} questions · {a.max_score} pts</span></span>
              <span className="flex gap-1">
                {a.origin === "ai" && <Badge tone="blue">AI draft</Badge>}
                <Badge tone={a.published_version ? (a.has_unpublished_changes ? "amber" : "green") : "slate"}>
                  {a.published_version ? (a.has_unpublished_changes ? "unpublished changes" : "published") : "draft"}
                </Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
