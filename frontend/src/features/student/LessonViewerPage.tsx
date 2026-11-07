import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router";

import { api } from "@/api/client";
import type { ChapterDetail, SceneOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card } from "@/components/ui";
import { useLesson } from "@/features/lessons/api";
import { LazySceneViewer } from "@/features/three-d/LazySceneViewer";

import { trackEvent, useOutline, useSetProgress } from "./api";

const md = "prose-sm max-w-none space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold";

export function LessonViewerPage() {
  const { lessonId = "" } = useParams();
  const lesson = useLesson(lessonId);
  const chapter = useQuery({
    queryKey: ["chapter", lesson.data?.chapter_id],
    queryFn: () => api.get<ChapterDetail>(`/chapters/${lesson.data?.chapter_id}`),
    enabled: !!lesson.data,
  });
  const courseId = chapter.data?.course_id;
  const outline = useOutline(courseId);
  const scenes = useQuery({ queryKey: ["scenes", lessonId], queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`) });
  const setProgress = useSetProgress(courseId);

  const flat = useMemo(() => outline.data?.chapters.flatMap((c) => c.lessons) ?? [], [outline.data]);
  const pos = flat.findIndex((l) => l.id === lessonId);
  const prev = pos > 0 ? flat[pos - 1] : undefined;
  const next = pos >= 0 ? flat[pos + 1] : undefined;
  const status = flat[pos]?.progress;

  useEffect(() => {
    if (!lesson.data || !courseId) return;
    trackEvent({ event_type: "lesson_opened", lesson_id: lessonId });
    if (status === "not_started") setProgress.mutate({ lessonId, status: "in_progress" });
  }, [lessonId, !!lesson.data, courseId]);

  if (lesson.isPending) return <Loading />;
  if (lesson.error) return <ErrorAlert error={lesson.error} />;
  const l = lesson.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Course contents" className="lg:sticky lg:top-4 lg:self-start">
        <details open className="rounded-lg border border-slate-200 bg-white p-3 lg:[&>summary]:hidden">
          <summary className="cursor-pointer text-sm font-medium">Course contents</summary>
          {courseId && <Link to={`/student/courses/${courseId}`} className="mb-2 block text-sm font-semibold hover:underline">{outline.data?.title}</Link>}
          {outline.data?.chapters.map((c) => (
            <div key={c.id} className="mb-2">
              <p className="text-xs font-semibold uppercase text-slate-500">{c.title}</p>
              <ul>
                {c.lessons.map((x) => (
                  <li key={x.id}>
                    <Link to={`/student/lessons/${x.id}`} aria-current={x.id === lessonId ? "page" : undefined} className={`block rounded px-2 py-1 text-sm ${x.id === lessonId ? "bg-navy-900 text-white" : "hover:bg-slate-100"}`}>
                      {x.progress === "completed" ? "✓ " : ""}{x.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      </nav>

      <article className="space-y-6">
        <header>
          <p className="text-sm text-slate-500">{chapter.data?.title}</p>
          <h1 className="text-2xl font-semibold text-navy-950">{l.title}</h1>
        </header>

        {(scenes.data ?? []).map((s) => (
          <section key={s.id} aria-label={`3D: ${s.title}`}>
            <LazySceneViewer
              sceneId={s.id}
              onEvent={(e) => trackEvent({ ...e, lesson_id: lessonId, scene_id: s.id })}
            />
          </section>
        ))}

        {(l.content.sections ?? []).map((sec, i) => (
          <Card key={i}>
            <h2 className="mb-2 text-lg font-semibold">{sec.title}</h2>
            <div className={md}>
              <ReactMarkdown skipHtml>{sec.body_markdown}</ReactMarkdown>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {(sec.key_terms ?? []).map((k) => <Badge key={k} tone="blue">{k}</Badge>)}
              {(sec.source_refs ?? []).map((r, k) => <Badge key={k}>source p. {r.page}</Badge>)}
            </div>
          </Card>
        ))}

        {(l.content.summary ?? []).length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Summary</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">{l.content.summary?.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          {prev ? <Link to={`/student/lessons/${prev.id}`} className="text-sm text-accent hover:underline">← {prev.title}</Link> : <span />}
          <div className="flex items-center gap-3">
            {status === "completed" ? (
              <Badge tone="green">Completed ✓</Badge>
            ) : (
              <Button disabled={setProgress.isPending} onClick={() => setProgress.mutate({ lessonId, status: "completed" })}>Mark as complete</Button>
            )}
            {next && <Link to={`/student/lessons/${next.id}`} className="rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white">Next: {next.title} →</Link>}
          </div>
        </div>
        <ErrorAlert error={setProgress.error} />
      </article>
    </div>
  );
}
