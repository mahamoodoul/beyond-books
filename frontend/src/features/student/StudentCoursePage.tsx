import { Link, useParams } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Card, PageHeader } from "@/components/ui";

import { useChapterAssessments } from "@/features/assessments/api";

import { useOutline } from "./api";
import { MyInsightsCard } from "./MyInsightsCard";
import { ProgressBar } from "./ProgressBar";

function ChapterQuizzes({ chapterId }: { chapterId: string }) {
  const list = useChapterAssessments(chapterId);
  if (!list.data?.length) return null;
  return (
    <ul className="mt-2 border-t border-slate-100 pt-2">
      {list.data.map((a) => (
        <li key={a.id}>
          <Link to={`/student/assessments/${a.id}`} className="flex items-center gap-2 rounded px-2 py-1 text-sm font-medium text-accent hover:bg-slate-50">
            ✎ {a.title} <span className="font-normal text-slate-500">({a.question_count} questions)</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const icon = { completed: "✓", in_progress: "◐", not_started: "○" } as const;

export function StudentCoursePage() {
  const { courseId } = useParams();
  const outline = useOutline(courseId);
  if (outline.isPending) return <Loading />;
  if (outline.error) return <ErrorAlert error={outline.error} />;
  const o = outline.data;
  return (
    <>
      <PageHeader title={o.title}>
        {o.next_lesson_id && <Link to={`/student/lessons/${o.next_lesson_id}`} className="rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white">Continue</Link>}
      </PageHeader>
      <div className="mb-6"><ProgressBar done={o.completed_lessons} total={o.total_lessons} label="Course progress" /></div>
      {courseId && <MyInsightsCard courseId={courseId} />}
      <div className="space-y-5">
        {o.chapters.length === 0 && <Card><p className="text-sm text-slate-600">Your teacher hasn't published any chapters yet.</p></Card>}
        {o.chapters.map((ch) => {
          const done = ch.lessons.filter((l) => l.progress === "completed").length;
          const with3d = ch.lessons.filter((l) => (l.scene_count ?? 0) > 0).length;
          return (
            <section key={ch.id} aria-label={`Chapter ${ch.position}: ${ch.title}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="bg-gradient-to-r from-navy-900 to-navy-700 px-5 py-4 text-white">
                <p className="text-xs uppercase tracking-widest text-white/60">Chapter {ch.position}</p>
                <h2 className="text-lg font-semibold">{ch.title} <span className="ml-1 text-sm text-white/70">{icon[ch.progress as keyof typeof icon]}</span></h2>
                {ch.description && <p className="mt-1 text-sm text-white/80">{ch.description}</p>}
                <p className="mt-2 text-xs text-white/70">{done}/{ch.lessons.length} lessons done{with3d > 0 && ` · ${with3d} with 3D models`}</p>
              </header>
              <div className="p-3">
                <ul className="space-y-1">
                  {ch.lessons.map((l) => (
                    <li key={l.id}>
                      <Link to={`/student/lessons/${l.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                        <span aria-label={l.progress.replace("_", " ")} className={l.progress === "completed" ? "text-green-700" : "text-slate-400"}>{icon[l.progress as keyof typeof icon]}</span>
                        <span className="flex-1 font-medium">{l.title}</span>
                        {(l.scene_count ?? 0) > 0 && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">◆ 3D</span>}
                        <span aria-hidden className="text-slate-400">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <ChapterQuizzes chapterId={ch.id} />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
