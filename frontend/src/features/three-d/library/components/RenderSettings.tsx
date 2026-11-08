/**
 * Lighting and post-processing tuned to look like Blender's EEVEE defaults:
 * AgX tone mapping, image-based lighting, ambient occlusion and soft shadows.
 * Everything here is generated locally — no HDRI or other files are fetched at runtime.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { AUTO_QUALITY, QUALITY, type QualityTier } from "@/features/three-d/library/runtime/quality";
import { viewBounds, type ViewerRuntime } from "@/features/three-d/library/runtime/viewerRuntime";

/** Soft studio lighting from three's RoomEnvironment, prefiltered on the GPU. */
export function StudioEnvironment({ intensity = 0.55 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) =>
          x.dispose(),
        );
      });
    };
  }, [gl, scene, intensity]);
  return null;
}

/** Tone mapping on the renderer, used when the composer is off (low tier). */
export function RendererToneMapping({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    if (!enabled) return;
    const prev = gl.toneMapping;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = 1;
    return () => {
      gl.toneMapping = prev;
    };
  }, [gl, enabled]);
  return null;
}

/**
 * Key, fill and rim lights. The key light casts soft shadows on medium and high.
 *
 * The shadow map is not redrawn every frame: with millions of triangles that would double the
 * geometry cost. It is redrawn only while something moves (explode easing, a playing animation,
 * procedural motion) or the visible set changes.
 */
export function StudioLights({
  runtime,
  tier,
  ready,
}: {
  runtime: RefObject<ViewerRuntime>;
  tier: QualityTier;
  ready: boolean;
}) {
  const key = useRef<THREE.DirectionalLight>(null);
  const gl = useThree((s) => s.gl);
  const shadows = QUALITY[tier].shadows;
  const lastKey = useRef("");

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  // fit the shadow camera to the scene, exploded or not, so shadows stay sharp
  useEffect(() => {
    const light = key.current;
    if (!light || !ready) return;
    const rt = runtime.current;
    const b = viewBounds(rt, 1);
    const center = new THREE.Vector3(...b.center);
    const dir = new THREE.Vector3(0.45, 0.8, 0.55).normalize();
    light.position.copy(center).addScaledVector(dir, b.radius * 3);
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    const cam = light.shadow.camera;
    const r = b.radius * 1.2;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = b.radius * 0.5;
    cam.far = b.radius * 6;
    cam.updateProjectionMatrix();
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = b.radius * 0.004;
    light.shadow.radius = 4;
    gl.shadowMap.needsUpdate = true;
  }, [runtime, ready, shadows, gl]);

  useFrame(() => {
    if (!shadows) return;
    const rt = runtime.current;
    const playing = rt.runner?.position.status === "playing";
    const sig = `${rt.explode.toFixed(4)}|${[...rt.hidden].join(",")}|${rt.frame.stepNumber ?? ""}`;
    if (playing || rt.animatedScene || rt.running || sig !== lastKey.current) {
      lastKey.current = sig;
      gl.shadowMap.needsUpdate = true;
    }
  });

  return (
    <>
      <hemisphereLight args={["#ffffff", "#c9d1dc", 0.45]} />
      <directionalLight
        ref={key}
        position={[6, 10, 8]}
        intensity={2.1}
        color="#fff6ea"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-8, 3, -6]} intensity={0.6} color="#c4d4ff" />
      <directionalLight position={[0, -6, 6]} intensity={0.25} color="#dfe8ff" />
    </>
  );
}

/**
 * AO + SMAA + bloom (emissive parts only) + AgX. The pass chain is identical on medium and
 * high, so a tier change only updates N8AO's sample preset on the live pass — no rebuild.
 */
export function PostEffects({ tier }: { runtime: RefObject<ViewerRuntime>; tier: QualityTier }) {
  const q = QUALITY[tier];
  if (!q.postprocessing) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        // N8AO's auto "transparencyAware" mode crashes (missing render targets) on scenes with
        // many blended materials. GLTFLoader already disables depthWrite on BLEND materials,
        // so plain AO behind see-through shells looks right without it.
        ref={(pass) => {
          if (!pass) return;
          (pass as unknown as { autoDetectTransparency: boolean }).autoDetectTransparency = false;
        }}
        // halfRes is avoided: N8AO never creates its downsample target when it starts half-res
        halfRes={false}
        quality={q.aoQuality}
        // radius in screen pixels: a world-space radius sized for the whole model turned into
        // large soft blobs when the camera flew in close to a single part, which read as blur
        screenSpaceRadius
        aoRadius={28}
        distanceFalloff={1}
        intensity={2}
        color="black"
      />
      <Bloom mipmapBlur luminanceThreshold={4} luminanceSmoothing={0.2} intensity={0.25} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}

/**
 * Steps "auto" quality down only after a sustained low frame rate while the view is actually
 * rendering. With on-demand rendering an idle view draws no frames, so gaps between frames
 * are ignored instead of being read as a low frame rate (drei's PerformanceMonitor does that).
 * Mounted a few seconds after the model is ready, so load-time hitches don't count.
 */
export function QualityMonitor({ enabled, onDecline }: { enabled: boolean; onDecline: () => void }) {
  const acc = useRef({ time: 0, frames: 0, declines: 0 });
  useFrame((_, delta) => {
    if (!enabled) return;
    const a = acc.current;
    if (delta > 0.25) return; // idle gap or tab switch, not a slow frame
    a.time += delta;
    a.frames += 1;
    if (a.time * 1000 < AUTO_QUALITY.sampleMs * AUTO_QUALITY.iterations) return;
    const fps = a.frames / a.time;
    a.time = 0;
    a.frames = 0;
    if (fps < AUTO_QUALITY.minFps && a.declines < 2) {
      a.declines += 1;
      onDecline();
    }
  });
  return null;
}
