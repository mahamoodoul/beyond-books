/**
 * GLB loader. Not cached: each viewer owns its copy and disposes it on unmount, so GPU memory is
 * returned when a student leaves the 3D page.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { Vec3 } from "./types";

/** The view the model was laid out for, from a camera in the GLB. */
export interface OwnView {
  /** From the model towards the camera. */
  direction: Vec3;
  /** Vertical field of view in degrees; null when the camera is orthographic. */
  fov: number | null;
}

export interface LoadedGlb {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  view: OwnView | null;
}

export async function loadGlb(url: string, signal?: AbortSignal): Promise<LoadedGlb> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  gltf.scene.updateWorldMatrix(true, true);
  let view: OwnView | null = null;
  // Registry assets must not carry their own cameras or lights into the scene; a camera only
  // tells the viewer where to start.
  gltf.scene.traverse((o) => {
    const camera = o as THREE.PerspectiveCamera;
    if (camera.isCamera && !view) {
      view = {
        direction: camera.getWorldDirection(new THREE.Vector3()).negate().toArray() as Vec3,
        fov: camera.isPerspectiveCamera ? camera.fov : null,
      };
    }
    if ((o as THREE.Light).isLight || camera.isCamera) o.visible = false;
  });
  // keep the baked clips with the scene (played by ClipPlayer for play_clip steps)
  gltf.scene.animations = gltf.animations;
  return { root: gltf.scene, clips: gltf.animations, view };
}
