import { useNavigate, useParams } from "react-router";

import { ARView } from "@/features/ar/components/ARView";

export function HeartARPage() {
  const navigate = useNavigate();
  const { courseId = "circulatory-system", lessonId = "heart-structure" } = useParams();

  return (
    <ARView
      onExit={() => navigate(`/student/courses/${courseId}/lessons/${lessonId}`, { replace: true })}
    />
  );
}
