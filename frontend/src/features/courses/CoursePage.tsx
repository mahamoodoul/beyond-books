import { useState } from "react";
import { useParams } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, PageHeader } from "@/components/ui";
import { OutlinePanel } from "@/features/ai/OutlinePanel";
import { ChaptersPanel } from "@/features/chapters/ChaptersPanel";
import { SourcesPanel } from "@/features/documents/SourcesPanel";

import { useCourse, useUpdateCourse } from "./api";
import { ProgressPanel } from "./ProgressPanel";
import { StudentsPanel } from "./StudentsPanel";

const TABS = ["Sources & outline", "Chapters", "Students", "Progress"] as const;
type Tab = (typeof TABS)[number];

export function CoursePage() {
  const { courseId = "" } = useParams();
  const course = useCourse(courseId);
  const update = useUpdateCourse(courseId);
  const [tab, setTab] = useState<Tab>("Sources & outline");

  if (course.isPending) return <Loading />;
  if (course.error) return <ErrorAlert error={course.error} />;
  const c = course.data;
  const published = c.status === "published";

  return (
    <>
      <PageHeader title={c.title}>
        <Badge tone={published ? "green" : "slate"}>{c.status}</Badge>
        <Button variant={published ? "secondary" : "primary"} disabled={update.isPending} onClick={() => update.mutate({ status: published ? "draft" : "published" })}>
          {published ? "Unpublish course" : "Publish course"}
        </Button>
      </PageHeader>
      <ErrorAlert error={update.error} />
      <div role="tablist" className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-navy-900 text-navy-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="space-y-6">
        {tab === "Sources & outline" && (
          <>
            <SourcesPanel courseId={courseId} />
            <OutlinePanel courseId={courseId} onApplied={() => setTab("Chapters")} />
          </>
        )}
        {tab === "Chapters" && <ChaptersPanel courseId={courseId} />}
        {tab === "Students" && <StudentsPanel courseId={courseId} />}
        {tab === "Progress" && <ProgressPanel courseId={courseId} />}
      </div>
    </>
  );
}
