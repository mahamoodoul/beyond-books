import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { SceneOut } from "@/api/generated/schema";
import { Icon } from "@/components/ui/Icon";
import type { SceneEvent } from "@/features/three-d/components/SceneViewer";
import { LazySceneStudio } from "@/features/three-d/LazySceneStudio";

import { firstMedia, useLessonMedia } from "./heartMedia";

/**
 * Student lesson visual for 3D scenes: the lesson's 2D picture (lesson media) with a "View in 3D"
 * button per scene; the interactive 3D viewer opens in a dialog instead of sitting in the page.
 * Same layout as the heart lesson's panel. Lessons without a picture show a simple 3D card.
 */
export function ScenePicturePanel({
  lessonId,
  scenes,
  onSceneEvent,
}: {
  lessonId: string;
  scenes: SceneOut[];
  onSceneEvent?: (e: SceneEvent, sceneId: string) => void;
}) {
  const media = useLessonMedia(lessonId);
  const picture = firstMedia(media.data, "image");
  const [open, setOpen] = useState<SceneOut | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const title = picture?.title || scenes[0]?.title || "Explore in 3D";

  function close() {
    const id = open?.id;
    setOpen(null);
    window.requestAnimationFrame(() => (id ? buttons.current.get(id)?.focus() : undefined));
  }

  return (
    <section aria-labelledby={`lesson-visual-${lessonId}`} className="lesson-visual panel">
      <div className="lesson-visual-heading">
        <span className="eyebrow eyebrow-muted">LESSON VISUAL</span>
        <h2 id={`lesson-visual-${lessonId}`}>{title}</h2>
      </div>
      {picture?.url ? (
        <figure className="lesson-visual-figure">
          <a aria-label="Open the full-size picture in a new tab" href={picture.url} rel="noreferrer" target="_blank">
            <img alt={picture.alt_text || title} src={picture.url} />
          </a>
          {picture.alt_text && <figcaption>{picture.alt_text}</figcaption>}
        </figure>
      ) : media.isPending ? (
        <div aria-label="Loading the lesson picture" className="lesson-visual-placeholder" role="status" />
      ) : (
        <div aria-hidden="true" className="lesson-visual-empty">
          <Icon name="layers" size={34} />
          <span>{scenes.length === 1 ? "Interactive 3D model" : `${scenes.length} interactive 3D models`}</span>
        </div>
      )}
      <div className="lesson-visual-buttons">
        {scenes.map((scene) => (
          <button
            className="button button-primary lesson-visual-3d"
            key={scene.id}
            onClick={() => setOpen(scene)}
            ref={(el) => {
              if (el) buttons.current.set(scene.id, el);
              else buttons.current.delete(scene.id);
            }}
            type="button"
          >
            <Icon name="layers" size={17} /> {scenes.length > 1 ? `View in 3D: ${scene.title}` : "View in 3D"}
          </button>
        ))}
      </div>
      <p className="lesson-visual-note">Turn the model, open any part to learn about it, and try the tour.</p>
      {open && (
        <Scene3DDialog
          onClose={close}
          onEvent={onSceneEvent ? (e) => onSceneEvent(e, open.id) : undefined}
          scene={open}
        />
      )}
    </section>
  );
}

function Scene3DDialog({
  scene,
  onClose,
  onEvent,
}: {
  scene: SceneOut;
  onClose: () => void;
  onEvent?: (e: SceneEvent) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Escape closes the dialog unless the viewer itself is in browser full screen.
      if (event.key === "Escape" && !document.fullscreenElement) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div className="heart-3d-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section aria-labelledby="scene-3d-title" aria-modal="true" className="heart-3d-dialog scene-3d-dialog" role="dialog">
        <header className="heart-3d-header">
          <div>
            <span className="eyebrow eyebrow-light">INTERACTIVE 3D MODEL</span>
            <h2 id="scene-3d-title">{scene.title}</h2>
          </div>
          <div className="heart-3d-header-actions">
            <button aria-label="Close 3D viewer" className="heart-3d-close" onClick={onClose} ref={closeRef} type="button">×</button>
          </div>
        </header>
        <div className="scene-3d-body">
          <LazySceneStudio onEvent={onEvent} sceneId={scene.id} />
        </div>
      </section>
    </div>,
    document.body,
  );
}
