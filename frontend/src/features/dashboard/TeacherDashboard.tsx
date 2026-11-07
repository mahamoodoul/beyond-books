import { PageHeader } from "@/components/ui";
import { CoursesCard } from "@/features/courses/CoursesCard";
import { SchoolsCard } from "@/features/schools/SchoolsCard";

export function TeacherDashboard() {
  return (
    <>
      <PageHeader title="Teacher dashboard" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <CoursesCard />
        <SchoolsCard />
      </div>
    </>
  );
}
