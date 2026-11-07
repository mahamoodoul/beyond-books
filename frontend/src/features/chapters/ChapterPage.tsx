import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { useCreateLesson, useLessons } from "@/features/lessons/api";

import { useChapter, useChapterMutations, useReplaceObjectives } from "./api";

export function ChapterPage() {
  const { chapterId = "" } = useParams();
  const chapter = useChapter(chapterId);
  const lessons = useLessons(chapterId);
  const createLesson = useCreateLesson(chapterId);
  const navigate = useNavigate();
  const courseId = chapter.data?.course_id ?? "";
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
      <Link to={`/teacher/courses/${c.course_id}`} className="text-sm text-accent hover:underline">← Back to course</Link>
      <PageHeader title={c.title}>
        <Badge tone={published ? "green" : "slate"}>{c.status}</Badge>
        <Button variant={published ? "secondary" : "primary"} onClick={() => m.update.mutate({ id: c.id, status: published ? "draft" : "published" })}>
          {published ? "Unpublish chapter" : "Publish chapter"}
        </Button>
      </PageHeader>
      <ErrorAlert error={m.update.error ?? replace.error ?? createLesson.error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={save} className="space-y-3">
            <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            {c.source_refs.length > 0 && (
              <p className="text-xs text-slate-500">
                Grounded in:{" "}
                {c.source_refs.map((r, i) => (
                  <Badge key={i}>pp. {String(r.page_start)}–{String(r.page_end)}</Badge>
                ))}
              </p>
            )}
            <Button type="submit" disabled={m.update.isPending}>Save chapter</Button>
          </form>
        </Card>
        <Card>
          <Field label="Learning objectives" hint="One per line.">
            <Textarea rows={6} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          </Field>
          <Button className="mt-3" variant="secondary" disabled={replace.isPending} onClick={saveObjectives}>Save objectives</Button>
        </Card>
      </div>
      <Card className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Lessons</h2>
          <div className="flex gap-2">
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
        {lessons.data?.length === 0 && <EmptyState title="No lessons yet" />}
        <ul className="divide-y divide-slate-100">
          {lessons.data?.map((l) => (
            <li key={l.id}>
              <Link to={`/teacher/lessons/${l.id}`} className="flex items-center justify-between py-2 hover:bg-slate-50">
                <span className="font-medium">{l.title}</span>
                <span className="flex gap-2">
                  {l.origin === "ai" && <Badge tone="blue">AI draft</Badge>}
                  {l.has_unpublished_changes && l.published_version && <Badge tone="amber">unpublished changes</Badge>}
                  <Badge tone={l.published_version ? "green" : "slate"}>{l.published_version ? "published" : "draft"}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
