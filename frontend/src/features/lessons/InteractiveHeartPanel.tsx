import { lazy, Suspense, useRef, useState } from "react";

import type { SceneOut } from "@/api/generated/schema";
import { Icon } from "@/components/ui/Icon";

const Heart3DView = lazy(() =>
  import("@/features/lessons/Heart3DView").then((module) => ({ default: module.Heart3DView })),
);

/**
 * 3D-library assets whose slug starts with this get the interactive heart experience (beating
 * model, slice view, AR page scan) in addition to the standard scene viewer. The asset is uploaded
 * as "Interactive Human Heart" by scripts/seed_demo_course.py; the slug gets a random suffix.
 */
const INTERACTIVE_HEART_SLUG = /^interactive_human_heart(_|$)/;

const DESCRIPTION =
  "Illustrated cutaway of a heart showing four chambers, the aorta and pulmonary vessels. " +
  "A heart model with chambers that can be selected to follow the flow of blood.";

export function usesInteractiveHeart(scene: SceneOut): boolean {
  return (scene.spec.asset_refs ?? []).some((ref) => INTERACTIVE_HEART_SLUG.test(ref.asset_id));
}

/**
 * The lesson's picture (the labelled heart page) with the option to open the interactive 3D heart
 * (beating model, labels, slice view, full screen) underneath it. The AR scan of this page lives in
 * the tablet/phone navigation, where a camera is available.
 */
export function InteractiveHeartPanel({ lessonId }: { lessonId: string }) {
  const [show3D, setShow3D] = useState(false);
  const view3DButtonRef = useRef<HTMLButtonElement>(null);
  const pageImage = `${import.meta.env.BASE_URL}targets/heart-page.png`;

  function close3DView() {
    setShow3D(false);
    window.requestAnimationFrame(() => view3DButtonRef.current?.focus());
  }

  return (
    <section aria-labelledby={`lesson-visual-${lessonId}`} className="lesson-visual panel">
      <div className="lesson-visual-heading">
        <span className="eyebrow eyebrow-muted">LESSON VISUAL</span>
        <h2 id={`lesson-visual-${lessonId}`}>The heart, at a glance</h2>
      </div>
      <figure className="lesson-visual-figure">
        <a aria-label="Open the full-size heart illustration in a new tab" href={pageImage} rel="noreferrer" target="_blank">
          <img
            alt="Textbook-style labeled diagram of the human heart, showing its chambers and major blood vessels."
            src={pageImage}
          />
        </a>
        <figcaption>Labelled diagram of the heart’s chambers and major blood vessels.</figcaption>
      </figure>
      <button className="button button-primary lesson-visual-3d" onClick={() => setShow3D(true)} ref={view3DButtonRef} type="button">
        <Icon name="layers" size={17} /> View in 3D
      </button>
      <p className="lesson-visual-note">
        Turn a beating heart, see each part labelled and try the slice view. On a tablet or phone, use <strong>Scan page</strong> in the menu to see it in AR.
      </p>
      {show3D && (
        <Suspense fallback={<div className="heart-3d-loading-screen" role="status">Preparing the 3D heart viewer…</div>}>
          <Heart3DView description={DESCRIPTION} onClose={close3DView} />
        </Suspense>
      )}
    </section>
  );
}
