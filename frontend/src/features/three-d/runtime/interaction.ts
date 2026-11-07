import type { Material, Mesh, Object3D } from "three";
import { Color, MeshStandardMaterial } from "three";

import type { SceneComponent } from "@/api/generated/schema";

/** Walk up from the hit object until we find an object whose name is a component mesh_name. */
export function componentFor(obj: Object3D | null, byMesh: Map<string, SceneComponent>): SceneComponent | null {
  for (let o = obj; o; o = o.parent) {
    const c = byMesh.get(o.name);
    if (c) return c;
  }
  return null;
}

const HIGHLIGHT = new Color("#facc15");

/** Give every mesh its own material copy so highlighting one part never affects another. */
export function isolateMaterials(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    }
  });
}

export function setHighlight(root: Object3D | null, on: boolean): void {
  root?.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mat instanceof MeshStandardMaterial) {
        mat.emissive.copy(on ? HIGHLIGHT : new Color(0, 0, 0));
        mat.emissiveIntensity = on ? 0.45 : 1;
      }
    }
  });
}

/** Dispose GPU resources of a cloned subtree (design §7.7). */
export function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mats: Material[] = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat) => mat.dispose());
  });
}
