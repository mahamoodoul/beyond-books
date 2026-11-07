import { useLocation, useNavigate, useParams } from "react-router";

import { ARView } from "@/features/ar/components/ARView";

/** Full-screen AR scan of the heart page for a lesson; exits back to wherever it was opened from. */
export function HeartARPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lessonId = "" } = useParams();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? `/student/lessons/${lessonId}`;

  return <ARView onExit={() => navigate(returnTo, { replace: true })} />;
}
