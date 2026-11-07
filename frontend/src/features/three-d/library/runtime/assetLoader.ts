/**
 * GLB loader. Not cached: each viewer owns its copy and disposes it on unmount, so GPU memory is
 * returned when a student leaves the 3D page.
 */
import type * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function loadGlb(url: string, signal?: AbortSignal): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  // Registry assets must not carry their own cameras or lights into the scene.
  gltf.scene.traverse((o) => {
    if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) o.visible = false;
  });
  return gltf.scene;
}
