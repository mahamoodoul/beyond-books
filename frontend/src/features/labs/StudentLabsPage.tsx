/** Student Labs tab: every published circuit lab from the student's courses, with their status. */
import { Link } from "react-router";

import { ErrorAlert, Loading } from "@/components/feedback";
import { Icon } from "@/components/ui/Icon";

import { useLabs } from "./api";
import { goalText, KIND_ICON, KIND_LABEL } from "./engines";
import "./labs.css";

export function StudentLabsPage() {
  const labs = useLabs();
  if (labs.isPending) return <Loading />;
  if (labs.error) return <ErrorAlert error={labs.error} />;
  const list = labs.data;
  const done = list.filter((l) => l.session?.status === "completed").length;

  return (
    <div className="student-course-page">
      <header className="lab-hero mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="lab-hero-icon"><Icon name="bolt" size={28} /></span>
          <div>
            <p className="lab-hero-eyebrow">Labs</p>
            <h1 className="text-2xl font-semibold leading-tight">Build, test, experiment</h1>
            <p className="text-sm text-white/80">
              {list.length === 0 ? "Your teachers have not published any labs yet." : `${list.length} lab${list.length === 1 ? "" : "s"} · ${done} goal${done === 1 ? "" : "s"} reached`}
            </p>
          </div>
        </div>
      </header>
      {list.length === 0 ? (
        <div className="catalog-message panel">
          <Icon name="bolt" size={24} />
          <h2>No labs yet</h2>
          <p>When a teacher publishes a circuit lab in one of your courses, it appears here and in the course path.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((lab) => {
            const status = lab.session?.status;
            const cta = status === "completed" ? "Open again" : status ? "Continue" : "Start";
            return (
              <li key={lab.id}>
                <Link to={`/student/labs/${lab.id}`} className="lab-card lab-card-3d flex h-full flex-col gap-2 rounded-2xl p-4 no-underline">
                  <div className="flex items-start justify-between gap-2">
                    <span className="lab-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={KIND_ICON[lab.kind] ?? "bolt"} size={18} /></span>
                    <span className={`course-status-chip course-status-${status === "completed" ? "completed" : status ? "in_progress" : "not_started"}`}>
                      {status === "completed" ? "Goal reached" : status ? "In progress" : "Not started"}
                    </span>
                  </div>
                  <h3 className="lab-card-title font-semibold">{lab.title}</h3>
                  <p className="lab-card-meta text-xs">{KIND_LABEL[lab.kind] ?? lab.kind}{lab.course_title ? ` · ${lab.course_title}` : ""}{lab.chapter_title ? ` · ${lab.chapter_title}` : ""}</p>
                  <p className="lab-card-text text-sm">{goalText(lab.kind, lab.goal as Record<string, unknown>)}</p>
                  <span className="lab-card-cta mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium">{cta} <Icon name="arrow-right" size={14} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
