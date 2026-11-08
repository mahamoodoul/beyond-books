import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import { TARGETS } from "@/features/ar/content/targets";
import { ModelHUD } from "@/features/ar/components/ModelHUD";
import { addLights, ModelExperience } from "@/features/ar/three/ModelExperience";
import { attachGestures } from "@/features/ar/three/gestures";

interface Heart3DViewProps {
  description: string;
  /** Signed link to the heart model (from the lesson's 3D scene); read once when the viewer opens. */
  modelUrl: string;
  onClose: () => void;
}

export function Heart3DView({ description, modelUrl, onClose }: Heart3DViewProps) {
  const modelUrlRef = useRef(modelUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [experience, setExperience] = useState<ModelExperience | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  // Full screen uses the Fullscreen API where available; the `is-fullscreen` class also covers
  // browsers without it (e.g. iPhone Safari) by filling the viewport.
  const setFullscreenMode = (on: boolean) => {
    fullscreenRef.current = on;
    setFullscreen(on);
    const dialog = dialogRef.current;
    if (on && dialog?.requestFullscreen && !document.fullscreenElement) void dialog.requestFullscreen().catch(() => undefined);
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && fullscreenRef.current) {
        fullscreenRef.current = false;
        setFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let model: ModelExperience | null = null;
    let detachGestures = () => {};
    let renderer: THREE.WebGLRenderer | null = null;
    let labelRenderer: CSS2DRenderer | null = null;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.localClippingEnabled = true; // slice view: lets the scanner's plane cut the model open
      renderer.domElement.setAttribute("aria-label", description);
      container.appendChild(renderer.domElement);
      labelRenderer = new CSS2DRenderer();
      labelRenderer.domElement.setAttribute("aria-label", "Interactive heart structure labels");
      Object.assign(labelRenderer.domElement.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
      });
      container.appendChild(labelRenderer.domElement);
    } catch (reason) {
      renderer?.dispose();
      renderer?.domElement.remove();
      labelRenderer?.domElement.remove();
      setError(describeError(reason));
      return;
    }
    const webglRenderer = renderer;
    const webglLabelRenderer = labelRenderer;
    if (!webglRenderer || !webglLabelRenderer) {
      setError("The browser could not initialize the 3D viewer.");
      return;
    }

    const scene = new THREE.Scene();
    addLights(scene);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    const target = TARGETS[0];
    if (!target) {
      setError("The heart model is not configured for web viewing.");
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer?.domElement.remove();
      return;
    }

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0 || !renderer) return;
      webglRenderer.setSize(clientWidth, clientHeight);
      webglLabelRenderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      if (model) {
        const dimensions = model.dimensions;
        const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const tanH = tanV * camera.aspect;
        const distance = Math.max(dimensions.y / 2 / tanV, dimensions.x / 2 / tanH) + dimensions.z / 2;
        camera.position.set(0, dimensions.y * 0.04, distance * 1.15);
        camera.lookAt(0, 0, 0);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (fullscreenRef.current) {
          fullscreenRef.current = false;
          setFullscreen(false);
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
          return;
        }
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    const stageObserver = new ResizeObserver(resize);
    stageObserver.observe(container);

    const animationFrame = () => {
      if (disposed || !renderer) return;
      model?.update(1 / 60);
      webglRenderer.render(scene, camera);
      webglLabelRenderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animationFrame);
    };

    const currentModel = new ModelExperience(target.parts, {
      heartbeat: target.heartbeat,
      surfaceParts: target.surfaceParts,
      explodeDistance: target.explodeDistance,
      explodeTurn: target.explodeTurn,
      ct: target.ct,
      partColors: target.partColors,
      meshColors: target.meshColors,
    });
    model = currentModel;
    currentModel.setBeating(false);
    currentModel.setSelectListener(setSelected);

    void currentModel.load(modelUrlRef.current, target.size).then(() => {
      if (disposed) {
        currentModel.dispose();
        return;
      }
      scene.add(currentModel.root);
      resize();
      detachGestures = attachGestures(webglRenderer.domElement, {
        onTap: (ndc) => currentModel.pick(ndc, camera),
        onDrag: (dx, dy) => {
          currentModel.rotateBy(dx * 0.012);
          currentModel.tiltBy(dy * 0.008);
        },
        onPinch: (factor) => currentModel.zoomBy(factor),
      });
      setExperience(currentModel);
      animationFrame();
    }).catch((reason: unknown) => {
      if (!disposed) setError(describeError(reason));
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      stageObserver.disconnect();
      detachGestures();
      currentModel.setSelectListener(null);
      currentModel.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      labelRenderer?.domElement.remove();
    };
  }, [description]);

  return createPortal(
    <div className="heart-3d-backdrop">
      <section
        aria-describedby="heart-3d-description"
        aria-labelledby="heart-3d-title"
        aria-modal="true"
        className={`heart-3d-dialog${fullscreen ? " is-fullscreen" : ""}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="heart-3d-header">
          <div>
            <span className="eyebrow eyebrow-light">INTERACTIVE 3D MODEL</span>
            <h2 id="heart-3d-title">The Human Heart</h2>
          </div>
          <div className="heart-3d-header-actions">
            <button
              aria-pressed={fullscreen}
              className="heart-3d-fullscreen"
              onClick={() => setFullscreenMode(!fullscreen)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                {fullscreen
                  ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                  : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
              <span>{fullscreen ? "Exit full screen" : "Full screen"}</span>
            </button>
            <button aria-label="Close 3D viewer" className="heart-3d-close" onClick={onClose} ref={closeButtonRef} type="button">×</button>
          </div>
        </header>
        <div className="heart-3d-body">
        <div className="heart-3d-stage" ref={containerRef}>
          {!experience && !error && <p className="heart-3d-loading" role="status">Loading the 3D heart…</p>}
          {error && (
            <div className="heart-3d-error" role="alert">
              <p>{error}</p>
              <p className="heart-3d-description"><strong>Model description:</strong> {description}</p>
              <button className="button button-secondary" onClick={onClose} type="button">Return to lesson</button>
            </div>
          )}
          {experience && (
            <ModelHUD
              colorNote={targetColorNote()}
              model={experience}
              onClose={() => experience.select(null)}
              selected={selected}
            />
          )}
        </div>
        {fullscreen && experience && (
          <aside aria-labelledby="heart-3d-key-title" className="heart-3d-key">
            <h3 id="heart-3d-key-title">Key</h3>
            <p>Select a part to highlight it on the heart and read about it.</p>
            <ul>
              {experience.presentParts.map((part) => (
                <li className={part.key === selected ? "is-open" : ""} key={part.key}>
                  <button
                    aria-controls={`heart-3d-key-detail-${part.key}`}
                    aria-expanded={part.key === selected}
                    className={part.key === selected ? "is-active" : ""}
                    onClick={() => experience.select(part.key === selected ? null : part.key)}
                    type="button"
                  >
                    <span aria-hidden="true" className="heart-3d-key-dot" style={{ background: part.color }} />
                    <span className="heart-3d-key-name">{part.name}</span>
                    <svg aria-hidden="true" className="heart-3d-key-chevron" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {part.key === selected && (
                    <div aria-live="polite" className="heart-3d-key-detail" id={`heart-3d-key-detail-${part.key}`}>
                      <p>{part.summary}</p>
                      <p className="heart-3d-key-fact"><strong>Did you know?</strong> {part.fact}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}
        </div>
        <p className="heart-3d-description" id="heart-3d-description"><strong>Model description:</strong> {description} Drag to rotate; pinch or use the controls to zoom.</p>
      </section>
    </div>,
    document.body,
  );
}

function targetColorNote(): string | undefined {
  return TARGETS[0]?.colorNote;
}

function describeError(reason: unknown): string {
  if (reason instanceof Error) return `The 3D model could not be opened: ${reason.message}`;
  return "WebGL is not available in this browser. You can still explore the illustrated heart in the lesson.";
}
