import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import type { ChapterOverview, CourseOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Input } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { useCourses } from "@/features/courses/api";
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
  const with3d = chapters.data?.filter((c) => (c.scenes ?? 0) > 0).length ?? 0;
  const published = course.status === "published";
  return (
    <li>
      <Link to={`/teacher/courses/${course.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className={`relative flex h-24 items-end bg-gradient-to-r ${style.banner} p-4 text-white`}>
          <Icon name={style.icon} size={30} className="opacity-90 transition group-hover:scale-110" />
          <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-semibold ${published ? "bg-white text-emerald-800" : "bg-white/25 text-white"}`}>
            {published ? "Published" : "Draft"}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
            {[course.subject, course.grade_level].filter(Boolean).join(" · ") || "Course"}
          </p>
          <h3 className="line-clamp-2 font-semibold text-slate-900">{course.title}</h3>
          {course.description && <p className="line-clamp-2 text-sm text-slate-600">{course.description}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Icon name="book" size={13} /> {n === undefined ? "…" : `${n} chapter${n === 1 ? "" : "s"}${n ? ` · ${live} live` : ""}`}</span>
            {n !== undefined && (
              <span className="inline-flex items-center gap-1" title={`${with3d} of ${n} chapters have 3D`}>
                <Icon name="layers" size={13} /> {scenes} 3D{n ? ` · ${with3d}/${n} chapters` : ""}
              </span>
            )}
            <span className="ml-auto">Updated {updated(course.updated_at)}</span>
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
          <p className="text-sm text-slate-600">Each course is built from a textbook, chapter by chapter.</p>
        </div>
        <Link to="/teacher/upload" className="inline-flex items-center gap-2 rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700">
          <Icon name="plus" size={16} /> New course
        </Link>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Filter courses" className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={filter === t.key} onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${filter === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
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
          <EmptyState title="No courses yet">Create a course from a textbook PDF to get started.</EmptyState>
        ) : (
          <EmptyState title="No courses match">Try another filter or search.</EmptyState>
        )
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => <CourseCard key={c.id} course={c} />)}
      </ul>
      {mine.length > 0 && (
        <p className="mt-6 text-xs text-slate-400">
          <Badge>Tip</Badge> Open a course, then use <strong>Open Studio</strong> on a chapter to generate its lesson, quiz and 3D.
        </p>
      )}
    </>
  );
}
