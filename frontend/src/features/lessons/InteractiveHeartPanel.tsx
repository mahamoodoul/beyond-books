import { lazy, Suspense, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { firstMedia, useHeartModelUrl, useLessonMedia } from "./heartMedia";

export { usesInteractiveHeart } from "./heartMedia";

const Heart3DView = lazy(() =>
  import("@/features/lessons/Heart3DView").then((module) => ({ default: module.Heart3DView })),
);

const DESCRIPTION =
  "Illustrated cutaway of a heart showing four chambers, the aorta and pulmonary vessels. " +
  "A heart model with chambers that can be selected to follow the flow of blood.";

/**
 * The lesson's picture with the option to open the interactive 3D heart (beating model, labels,
 * slice view, full screen) underneath it. Everything comes from the backend: the picture is lesson
 * media, the model is the lesson's 3D scene asset. The AR scan of this page lives in the
 * tablet/phone navigation, where a camera is available.
 */
export function InteractiveHeartPanel({ lessonId, sceneId }: { lessonId: string; sceneId: string }) {
  const [show3D, setShow3D] = useState(false);
  const view3DButtonRef = useRef<HTMLButtonElement>(null);
  const media = useLessonMedia(lessonId);
  const model = useHeartModelUrl(sceneId);
  const picture = firstMedia(media.data, "image");
  const modelUrl = model.data ?? null;

  function close3DView() {
    setShow3D(false);
    window.requestAnimationFrame(() => view3DButtonRef.current?.focus());
  }

  return (
    <section aria-labelledby={`lesson-visual-${lessonId}`} className="lesson-visual panel">
      <div className="lesson-visual-heading">
        <span className="eyebrow eyebrow-muted">LESSON VISUAL</span>
        <h2 id={`lesson-visual-${lessonId}`}>{picture?.title || "The heart, at a glance"}</h2>
      </div>
      {picture?.url ? (
        <figure className="lesson-visual-figure">
          <a aria-label="Open the full-size picture in a new tab" href={picture.url} rel="noreferrer" target="_blank">
            <img alt={picture.alt_text || "Lesson picture"} src={picture.url} />
          </a>
          {picture.alt_text && <figcaption>{picture.alt_text}</figcaption>}
        </figure>
      ) : media.isPending ? (
        <div aria-label="Loading the lesson picture" className="lesson-visual-placeholder" role="status" />
      ) : null}
      <button
        className="button button-primary lesson-visual-3d"
        disabled={!modelUrl}
        onClick={() => setShow3D(true)}
        ref={view3DButtonRef}
        type="button"
      >
        <Icon name="layers" size={17} /> {model.isPending ? "Preparing 3D…" : "View in 3D"}
      </button>
      {model.isError && <p className="lesson-visual-note" role="alert">The 3D model could not be loaded. Try again in a moment.</p>}
      <p className="lesson-visual-note">
        Turn a beating heart, see each part labelled and try the slice view. On a tablet or phone, use <strong>Scan page</strong> in the menu to see it in AR.
      </p>
      {show3D && modelUrl && (
        <Suspense fallback={<div className="heart-3d-loading-screen" role="status">Preparing the 3D heart viewer…</div>}>
          <Heart3DView description={DESCRIPTION} modelUrl={modelUrl} onClose={close3DView} />
        </Suspense>
      )}
    </section>
  );
}
