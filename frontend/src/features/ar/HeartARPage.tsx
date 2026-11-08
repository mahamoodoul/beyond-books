import { useLocation, useNavigate, useParams } from "react-router";

import { ARView } from "@/features/ar/components/ARView";
import { firstMedia, useHeartModelUrl, useLessonMedia, useLessonScenes, usesInteractiveHeart } from "@/features/lessons/heartMedia";

/**
 * Full-screen AR scan of a lesson's page; exits back to wherever it was opened from.
 * The scan target (.mind) is the lesson's AR media and the model is its 3D scene's heart asset,
 * both from the backend.
 */
export function HeartARPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lessonId = "" } = useParams();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? `/student/lessons/${lessonId}`;
  const exit = () => navigate(returnTo, { replace: true });

  const scenes = useLessonScenes(lessonId);
  const heartScene = scenes.data?.find(usesInteractiveHeart);
  const model = useHeartModelUrl(heartScene?.id);
  const media = useLessonMedia(lessonId);
  const target = firstMedia(media.data, "ar_target");

  const loading = scenes.isPending || media.isPending || (!!heartScene && model.isPending);
  if (target?.url && model.data) {
    return <ARView mindUrl={target.url} modelUrl={model.data} onExit={exit} />;
  }
  return (
    <div className="ar-root">
      <div className="overlay">
        {loading ? (
          <p role="status">Preparing augmented reality…</p>
        ) : (
          <>
            <p className="error" role="alert">This lesson has no page to scan in AR yet.</p>
            <button onClick={exit} type="button">Return to lesson</button>
          </>
        )}
      </div>
    </div>
  );
}
