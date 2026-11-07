import { EmptyState } from "@/components/feedback";
import { PageHeader } from "@/components/ui";

export function StudentDashboard() {
  return (
    <>
      <PageHeader title="My learning" />
      <EmptyState title="No courses yet">Courses your teacher publishes will appear here.</EmptyState>
    </>
  );
}
