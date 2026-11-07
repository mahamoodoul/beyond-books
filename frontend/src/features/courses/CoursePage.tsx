import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { OutlinePanel } from "@/features/ai/OutlinePanel";
import { AnalyticsPanel } from "@/features/analytics/AnalyticsPanel";
import { ChaptersPanel } from "@/features/chapters/ChaptersPanel";
import { SourcesPanel } from "@/features/documents/SourcesPanel";

import { useCourse, useUpdateCourse } from "./api";
import { ProgressPanel } from "./ProgressPanel";
import { StudentsPanel } from "./StudentsPanel";

const TABS = ["Sources & outline", "Chapters", "Students", "Progress", "Analytics", "Course details"] as const;
type Tab = (typeof TABS)[number];

export function CoursePage() {
  const { courseId = "" } = useParams();
  const course = useCourse(courseId);
  const update = useUpdateCourse(courseId);
  const [details, setDetails] = useState({ title: "", subject: "", grade_level: "", description: "" });
  useEffect(() => {
    if (course.data) setDetails({ title: course.data.title, subject: course.data.subject ?? "", grade_level: course.data.grade_level ?? "", description: course.data.description });
  }, [course.data]);
  const saveDetails = (event: FormEvent) => { event.preventDefault(); update.mutate(details); };
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
      <p className="mb-5 text-sm text-slate-600">Review your sources and outline, open each chapter to create lessons and assessments, then publish the lessons, chapters, and course for enrolled students. Add 3D scenes inside each lesson.</p>
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
        {tab === "Analytics" && <AnalyticsPanel courseId={courseId} />}
        {tab === "Course details" && <Card><form onSubmit={saveDetails} className="grid gap-4 sm:grid-cols-2">
          <Field label="Course title"><Input required maxLength={200} value={details.title} onChange={e => setDetails({ ...details, title: e.target.value })} /></Field>
          <Field label="Subject"><Input maxLength={80} value={details.subject} onChange={e => setDetails({ ...details, subject: e.target.value })} /></Field>
          <Field label="Grade level"><Input maxLength={40} value={details.grade_level} onChange={e => setDetails({ ...details, grade_level: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={4} maxLength={5000} value={details.description} onChange={e => setDetails({ ...details, description: e.target.value })} /></Field>
          <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save course details"}</Button>
          {update.isSuccess && <p role="status">Course saved.</p>}
        </form></Card>}
      </div>
    </>
  );
}
