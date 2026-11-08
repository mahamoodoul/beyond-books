import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { OutlinePanel } from "@/features/ai/OutlinePanel";
import { AnalyticsPanel } from "@/features/analytics/AnalyticsPanel";
import { SourcesPanel } from "@/features/documents/SourcesPanel";

import { useScrollFade } from "@/lib/useScrollFade";
import { useRovingTabs } from "@/lib/useRovingTabs";

import { useCourse, useUpdateCourse } from "./api";
import { ChapterBoard, useChapterOverview } from "./ChapterBoard";
import { ProgressPanel } from "./ProgressPanel";
import { StudentsPanel } from "./StudentsPanel";
import { subjectStyle } from "./subjects";

const TABS = ["Chapters", "Sources & outline", "Students", "Progress", "Analytics", "Course details"] as const;
type Tab = (typeof TABS)[number];

function Number_({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-white/10 px-3 py-2">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-white/70">{label}</p>
    </div>
  );
}

export function CoursePage() {
  const { courseId = "" } = useParams();
  const course = useCourse(courseId);
  const update = useUpdateCourse(courseId);
  const overview = useChapterOverview(courseId);
  const [details, setDetails] = useState({ title: "", subject: "", grade_level: "", description: "" });
  useEffect(() => {
    if (course.data) setDetails({ title: course.data.title, subject: course.data.subject ?? "", grade_level: course.data.grade_level ?? "", description: course.data.description });
  }, [course.data]);
  const saveDetails = (event: FormEvent) => { event.preventDefault(); update.mutate(details); };
  const [chosenTab, setTab] = useState<Tab | null>(null);
  // New courses start with their sources; once there are chapters, the chapter list comes first.
  const tab: Tab = chosenTab ?? (overview.data && overview.data.length === 0 ? "Sources & outline" : "Chapters");
  const tabStrip = useScrollFade<HTMLDivElement>(tab);
  const rovingTabs = useRovingTabs<HTMLDivElement>();
  const tabList = useCallback((node: HTMLDivElement | null) => { tabStrip(node); rovingTabs(node); }, [tabStrip, rovingTabs]);

  if (course.isPending) return <Loading />;
  if (course.error) return <ErrorAlert error={course.error} />;
  const c = course.data;
  const published = c.status === "published";
  const style = subjectStyle(c.subject, c.title);
  const chapters = overview.data ?? [];
  const sum = (k: "lessons" | "scenes" | "quizzes") => chapters.reduce((n, ch) => n + (ch[k] ?? 0), 0);

  return (
    <>
      <Link to="/teacher/courses" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">← My courses</Link>
      <header className={`mb-6 overflow-hidden rounded-2xl bg-gradient-to-r ${style.banner} p-4 text-white shadow-sm sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/15"><Icon name={style.icon} size={28} /></span>
          {/* basis-52: on narrow screens the status/publish controls wrap below instead of squeezing the title */}
          <div className="min-w-0 flex-1 basis-52">
            <p className="text-sm text-white/80">{[c.subject, c.grade_level].filter(Boolean).join(" · ") || "Course"}</p>
            <h1 className="text-xl font-semibold break-words sm:text-2xl">{c.title}</h1>
            {c.description && <p className="mt-1 max-w-3xl text-sm text-white/85">{c.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${published ? "bg-white text-emerald-800" : "bg-white/20 text-white"}`}>{published ? "Published" : "Draft"}</span>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: published ? "draft" : "published" })}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-white/90 disabled:opacity-60"
            >
              {published ? "Unpublish" : "Publish course"}
            </button>
          </div>
        </div>
        <div className="mt-5 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
          <Number_ value={chapters.length} label="chapters" />
          <Number_ value={sum("lessons")} label="lessons" />
          <Number_ value={sum("scenes")} label="3D scenes" />
          <Number_ value={sum("quizzes")} label="quizzes" />
        </div>
      </header>
      <ErrorAlert error={update.error} />

      <div role="tablist" aria-label="Course sections" ref={tabList} className="scroll-fade mb-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]">
        {TABS.map((t, i) => (
          <button
            key={t}
            id={`course-tab-${i}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls="course-tabpanel"
            onClick={() => setTab(t)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-navy-900 text-navy-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="course-tabpanel" aria-labelledby={`course-tab-${TABS.indexOf(tab)}`} className="space-y-6">
        {tab === "Chapters" && <ChapterBoard courseId={courseId} accent={style} onGoToSources={() => setTab("Sources & outline")} />}
        {tab === "Sources & outline" && (
          <>
            <SourcesPanel courseId={courseId} />
            <OutlinePanel courseId={courseId} onApplied={() => setTab("Chapters")} />
          </>
        )}
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
