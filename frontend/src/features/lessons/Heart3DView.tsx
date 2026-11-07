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
  onClose: () => void;
}

export function Heart3DView({ description, onClose }: Heart3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [experience, setExperience] = useState<ModelExperience | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const onCloseRef = useRef(onClose);

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
      renderer.localClippingEnabled = true; // CT cutaway: lets the scanner's slice plane cut the model open
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

    void currentModel.load(target.modelUrl, target.size).then(() => {
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
        className="heart-3d-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="heart-3d-header">
          <div>
            <span className="eyebrow eyebrow-light">INTERACTIVE 3D MODEL</span>
            <h2 id="heart-3d-title">The Human Heart</h2>
          </div>
          <button aria-label="Close 3D viewer" className="heart-3d-close" onClick={onClose} ref={closeButtonRef} type="button">×</button>
        </header>
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
