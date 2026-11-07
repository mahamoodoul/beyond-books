import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import type { ChapterOverview, CourseOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Input } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useCourses } from "@/features/courses/api";
import { NewCourseButton } from "@/features/courses/NewCourseButton";
import { subjectStyle } from "@/features/courses/subjects";

type Filter = "all" | "published" | "draft";

function updated(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Stat({ value, label, soft, title }: { value: number | string; label: string; soft: string; title?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-md px-2 py-1 ${soft}`} title={title}>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </span>
  );
}

function CourseCard({ course }: { course: CourseOut }) {
  const style = subjectStyle(course.subject, course.title);
  const chapters = useQuery({
    queryKey: ["chapter-overview", course.id],
    queryFn: () => api.get<ChapterOverview[]>(`/courses/${course.id}/chapter-overview`),
    staleTime: 60_000,
  });
  const n = chapters.data?.length;
  const live = chapters.data?.filter((c) => c.status === "published").length ?? 0;
  const scenes = chapters.data?.reduce((s, c) => s + (c.scenes ?? 0), 0) ?? 0;
  const lessons = chapters.data?.reduce((s, c) => s + (c.lessons ?? 0), 0) ?? 0;
  const published = course.status === "published";
  const pct = n ? Math.round((live / n) * 100) : 0;
  const eyebrow = [course.subject, course.grade_level].filter(Boolean).join(" · ") || "Course";

  return (
    <li>
      <Link
        to={`/teacher/courses/${course.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      >
        <div className={`relative flex h-28 items-start justify-between bg-gradient-to-br ${style.banner} p-4 text-white`}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm transition group-hover:scale-105">
            <Icon name={style.icon} size={22} />
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${published ? "bg-white text-emerald-800" : "bg-white/20 text-white ring-1 ring-white/40"}`}>
            {published ? "Published" : "Draft"}
          </span>
          <Icon name={style.icon} size={120} className="pointer-events-none absolute -bottom-8 -right-6 opacity-10" />
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{eyebrow}</p>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">{course.title}</h3>
          {course.description && <p className="line-clamp-2 text-sm text-slate-600">{course.description}</p>}

          <div className="mt-auto pt-3">
            <div className="flex flex-wrap gap-1.5">
              <Stat value={n ?? "…"} label={n === 1 ? "chapter" : "chapters"} soft={style.soft} />
              {n !== undefined && <Stat value={lessons} label={lessons === 1 ? "lesson" : "lessons"} soft={style.soft} />}
              {n !== undefined && <Stat value={scenes} label="3D" soft={style.soft} title={`${scenes} 3D scene${scenes === 1 ? "" : "s"}`} />}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" title={n ? `${live} of ${n} chapters published` : "No chapters yet"}>
                <span className={`block h-full rounded-full ${style.solid} transition-[width]`} style={{ width: `${pct}%` }} />
              </span>
              <span className="shrink-0">{n ? `${live}/${n} live` : "no chapters"}</span>
              <span className="shrink-0 text-slate-300">·</span>
              <span className="shrink-0">{updated(course.updated_at)}</span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function TeacherCoursesPage() {
  const courses = useCourses();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const mine = (courses.data ?? []).filter((c) => c.can_manage).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const counts = { all: mine.length, published: mine.filter((c) => c.status === "published").length, draft: mine.filter((c) => c.status !== "published").length };
  const shown = mine.filter((c) => {
    const okFilter = filter === "all" || (filter === "published" ? c.status === "published" : c.status !== "published");
    const text = `${c.title} ${c.subject ?? ""} ${c.grade_level ?? ""}`.toLowerCase();
    return okFilter && (!q.trim() || text.includes(q.trim().toLowerCase()));
  });
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "published", label: "Published" },
    { key: "draft", label: "Drafts" },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold text-navy-950">My courses</h1>
          <p className="text-sm text-slate-600">
            Each course is built from a textbook, chapter by chapter. Open a course, then <strong>Open Studio</strong> on a chapter to generate its lesson, quiz and 3D.
          </p>
        </div>
        <NewCourseButton className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-700">
          <Icon name="plus" size={16} /> <span className="text-white">New course</span>
        </NewCourseButton>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Filter courses" className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${filter === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {t.label} <span className="text-xs text-slate-400">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search courses" placeholder="Search by title, subject or grade" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {courses.isPending && <Loading />}
      <ErrorAlert error={courses.error} />
      {courses.data && shown.length === 0 && (
        mine.length === 0 ? (
          <EmptyState title="No courses yet">Create a course, then upload its textbook PDF to get started.</EmptyState>
        ) : (
          <EmptyState title="No courses match">Try another filter or search.</EmptyState>
        )
      )}
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => <CourseCard key={c.id} course={c} />)}
      </ul>
    </>
  );
}
