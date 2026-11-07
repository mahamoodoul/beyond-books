/**
 * Lighting and post-processing tuned to look like Blender's EEVEE defaults:
 * AgX tone mapping, image-based lighting, ambient occlusion and soft shadows.
 * Everything here is generated locally — no HDRI or other files are fetched at runtime.
 */
import { PerformanceMonitor } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { explodedBounds } from "@/features/three-d/runtime/explode";
import { QUALITY, type QualityTier } from "@/features/three-d/runtime/quality";
import type { ViewerRuntime } from "@/features/three-d/runtime/viewerRuntime";

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

/** Key, fill and rim lights. The key light casts soft shadows on the high tier. */
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
  const shadows = QUALITY[tier].shadows;

  // fit the shadow camera to the scene, exploded or not, so shadows stay sharp
  useEffect(() => {
    const light = key.current;
    if (!light || !ready) return;
    const rt = runtime.current;
    const b = explodedBounds(rt.bounds, rt.offsets, 1);
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
    light.shadow.needsUpdate = true;
  }, [runtime, ready, shadows]);

  return (
    <>
      <hemisphereLight args={["#eef3ff", "#1a2238", 0.35]} />
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

/** AO + anti-aliasing + AgX, and a little bloom for emissive parts on high. */
export function PostEffects({ runtime, tier }: { runtime: RefObject<ViewerRuntime>; tier: QualityTier }) {
  const q = QUALITY[tier];
  if (!q.postprocessing) return null;
  const radius = explodedBounds(runtime.current.bounds, {}, 0).radius;
  return (
    // keyed by tier: N8AO crashes if halfRes/quality change on a live pass, so rebuild instead
    <EffectComposer key={tier} multisampling={q.multisampling} enableNormalPass={false}>
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
        quality={q.ambientOcclusion === "full" ? "high" : "performance"}
        aoRadius={radius * 0.18}
        distanceFalloff={radius * 0.08}
        intensity={3}
        color="black"
      />
      {q.bloom ? <Bloom mipmapBlur luminanceThreshold={4} luminanceSmoothing={0.2} intensity={0.25} /> : <></>}
      {q.multisampling === 0 ? <SMAA /> : <></>}
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}

/** Steps "auto" quality down when the device can't keep up. */
export function QualityMonitor({ enabled, onDecline }: { enabled: boolean; onDecline: () => void }) {
  if (!enabled) return null;
  return <PerformanceMonitor flipflops={2} onDecline={onDecline} />;
}
