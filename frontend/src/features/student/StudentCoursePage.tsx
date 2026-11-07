import { Link, useParams } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Card, PageHeader } from "@/components/ui";

import { useChapterAssessments } from "@/features/assessments/api";

import { useOutline } from "./api";
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
      <div className="space-y-4">
        {o.chapters.map((ch) => (
          <Card key={ch.id}>
            <h2 className="font-semibold">{ch.position}. {ch.title} <span className="ml-1 text-sm text-slate-500">{icon[ch.progress as keyof typeof icon]}</span></h2>
            {ch.description && <p className="text-sm text-slate-600">{ch.description}</p>}
            <ul className="mt-2 space-y-1">
              {ch.lessons.map((l) => (
                <li key={l.id}>
                  <Link to={`/student/lessons/${l.id}`} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                    <span aria-label={l.progress.replace("_", " ")} className={l.progress === "completed" ? "text-green-700" : "text-slate-400"}>{icon[l.progress as keyof typeof icon]}</span>
                    {l.title}
                  </Link>
                </li>
              ))}
            </ul>
            <ChapterQuizzes chapterId={ch.id} />
          </Card>
        ))}
      </div>
    </>
  );
}
