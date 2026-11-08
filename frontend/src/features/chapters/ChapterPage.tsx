/**
 * Teacher chapter page: a banner in the course's colour with the chapter's status, numbers and
 * main actions (Open Studio, Preview, Publish), then lessons and assessments on the left and the
 * chapter's details and learning objectives on the right.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { GenerateLessonButton } from "@/features/ai/GenerateLessonButton";
import { ChapterAssessmentsCard } from "@/features/assessments/ChapterAssessmentsCard";
import { useCourse } from "@/features/courses/api";
import { subjectStyle } from "@/features/courses/subjects";
import { useCreateLesson, useLessons } from "@/features/lessons/api";

import { useChapter, useChapterMutations, useReplaceObjectives } from "./api";

function Number_({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg bg-white/15 px-3 py-2 ring-1 ring-white/20">
      <p className="text-lg font-semibold leading-tight">{value}</p>
      <p className="text-xs text-white/80">{label}</p>
    </div>
  );
}

function pagesOf(refs: { page_start?: number; page_end?: number }[]): string | null {
  if (!refs.length) return null;
  return refs.map((r) => (r.page_start === r.page_end ? `p. ${r.page_start}` : `pp. ${r.page_start}–${r.page_end}`)).join(", ");
}

export function ChapterPage() {
  const { chapterId = "" } = useParams();
  const chapter = useChapter(chapterId);
  const lessons = useLessons(chapterId);
  const createLesson = useCreateLesson(chapterId);
  const navigate = useNavigate();
  const courseId = chapter.data?.course_id ?? "";
  const course = useCourse(courseId);
  const m = useChapterMutations(courseId);
  const replace = useReplaceObjectives(chapterId);
  const [form, setForm] = useState({ title: "", description: "" });
  const [objectives, setObjectives] = useState("");

  useEffect(() => {
    if (chapter.data) {
      setForm({ title: chapter.data.title, description: chapter.data.description });
      setObjectives((chapter.data.objectives ?? []).map((o) => o.objective_text).join("\n"));
    }
  }, [chapter.data]);

  if (chapter.isPending) return <Loading />;
  if (chapter.error) return <ErrorAlert error={chapter.error} />;
  const c = chapter.data;
  const published = c.status === "published";
  const style = subjectStyle(course.data?.subject, course.data?.title ?? "");
  const pages = pagesOf(c.source_refs as { page_start?: number; page_end?: number }[]);
  const nLessons = lessons.data?.length;
  const liveLessons = lessons.data?.filter((l) => l.published_version).length ?? 0;
  const nObjectives = (c.objectives ?? []).length;

  const save = (e: FormEvent) => {
    e.preventDefault();
    m.update.mutate({ id: c.id, ...form });
  };
  const saveObjectives = () =>
    replace.mutate(
      objectives
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ text, source_refs: [] })),
    );

  return (
    <>
      <Link to={`/teacher/courses/${c.course_id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        ← {course.data?.title ?? "Back to course"}
      </Link>

      <header className={`mb-6 overflow-hidden rounded-2xl bg-gradient-to-br ${style.banner} p-6 text-white shadow-sm`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/20 text-lg font-semibold ring-1 ring-white/30">
            {c.position}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80">
              Chapter {c.position}
              {course.data?.subject && ` · ${course.data.subject}`}
              {course.data?.grade_level && ` · ${course.data.grade_level}`}
            </p>
            <h1 className="text-2xl font-semibold">{c.title}</h1>
            {c.description && <p className="mt-1 max-w-3xl text-sm text-white/85">{c.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${published ? "bg-white text-emerald-800" : "bg-white/20 text-white ring-1 ring-white/40"}`}>
              {published ? "Published" : "Draft"}
            </span>
            <Link to={`/teacher/chapters/${c.id}/preview`} className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/30 hover:bg-white/25">
              <Icon name="eye" size={15} /> Preview
            </Link>
            <Link to={`/teacher/chapters/${c.id}/studio`} className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium hover:bg-white/90">
              {/* Colour on a span: the global `button`/`a` colour rules beat utilities. */}
              <span className="inline-flex items-center gap-1.5 text-slate-900"><Icon name="sparkles" size={15} /> Open Studio</span>
            </Link>
            <button
              type="button"
              disabled={m.update.isPending}
              onClick={() => m.update.mutate({ id: c.id, status: published ? "draft" : "published" })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 disabled:opacity-60 ${published ? "bg-white/15 ring-white/30 hover:bg-white/25" : "bg-white ring-white hover:bg-white/90"}`}
            >
              <span className={published ? "text-white" : "text-emerald-800"}>{published ? "Unpublish" : "Publish chapter"}</span>
            </button>
          </div>
        </div>
        <div className="mt-5 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
          <Number_ value={nLessons ?? "…"} label="lessons" />
          <Number_ value={liveLessons} label="live" />
          <Number_ value={nObjectives} label="objectives" />
          <Number_ value={pages ?? "—"} label="textbook pages" />
        </div>
      </header>
      <ErrorAlert error={m.update.error ?? replace.error ?? createLesson.error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Lessons</h2>
                <p className="text-xs text-slate-500">Generate a lesson from the chapter's pages, or write one yourself.</p>
              </div>
              <div className="flex items-start gap-2">
                <GenerateLessonButton chapterId={c.id} />
                <Button
                  variant="secondary"
                  disabled={createLesson.isPending}
                  onClick={() => createLesson.mutate({ title: "New lesson" }, { onSuccess: (l) => navigate(`/teacher/lessons/${l.id}`) })}
                >
                  New blank lesson
                </Button>
              </div>
            </div>
            {lessons.isPending && <Loading />}
            {lessons.data?.length === 0 && <EmptyState title="No lessons yet">Use Generate lesson, or open the Studio to build the whole chapter.</EmptyState>}
            <ol className="divide-y divide-slate-100">
              {lessons.data?.map((l, i) => (
                <li key={l.id}>
                  <Link to={`/teacher/lessons/${l.id}`} className="group flex items-center gap-3 py-2.5 hover:bg-slate-50">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold ${style.soft} ${style.text}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900 group-hover:underline">{l.title}</span>
                    <span className="flex shrink-0 gap-1.5">
                      {l.origin === "ai" && <Badge tone="blue">AI draft</Badge>}
                      {l.has_unpublished_changes && l.published_version && <Badge tone="amber">unpublished changes</Badge>}
                      <Badge tone={l.published_version ? "green" : "slate"}>{l.published_version ? "published" : "draft"}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
          <ChapterAssessmentsCard chapterId={c.id} />
        </div>

        <div className="space-y-6">
          <Card>
            <form onSubmit={save} className="space-y-3">
              <h2 className="font-semibold text-slate-900">Chapter details</h2>
              <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              {pages && (
                <p className="text-xs text-slate-500">
                  Grounded in textbook <span className="font-medium text-slate-700">{pages}</span>
                </p>
              )}
              <Button type="submit" disabled={m.update.isPending}>{m.update.isPending ? "Saving…" : "Save chapter"}</Button>
              {m.update.isSuccess && <span className="ml-2 text-xs text-slate-500" role="status">Saved.</span>}
            </form>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold text-slate-900">Learning objectives</h2>
            <Field label={`${nObjectives} objective${nObjectives === 1 ? "" : "s"}`} hint="One per line. Start with a verb: identify, explain, compare…">
              <Textarea rows={7} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
            </Field>
            <Button className="mt-3" variant="secondary" disabled={replace.isPending} onClick={saveObjectives}>
              {replace.isPending ? "Saving…" : "Save objectives"}
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
