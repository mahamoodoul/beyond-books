/**
 * Interaction registry (design §11.5 InteractionRegistry): maps component_id <-> scene node and
 * applies the per-frame visual state (explode, visibility, opacity, highlight, rotation).
 *
 * Materials are cloned per component so highlighting one part never tints another that shared a
 * material in the GLB.
 */
import * as THREE from "three";

import type { AnimationFrame } from "./animation";
import type { ComponentBounds } from "./explode";
import type { ResolvedComponent, Vec3 } from "./types";

interface MaterialSlot {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  emissive: THREE.Color | null;
  emissiveIntensity: number;
}

export interface RegisteredComponent {
  component: ResolvedComponent;
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  /** Geometric centre in the object's local space (pivot for rotations). */
  localCenter: THREE.Vector3;
  /** Label anchor in the object's local space. */
  labelAnchor: THREE.Vector3;
  /** World-space bounds at rest (explode = 0). */
  restCenter: THREE.Vector3;
  size: THREE.Vector3;
  slots: MaterialSlot[];
}

export interface ViewState {
  explode: number;
  offsets: Readonly<Record<string, Vec3>>;
  frame: AnimationFrame;
  hidden: ReadonlySet<string>;
  selected: string | null;
  /** Focus mode: every other component is ghosted so this one stands out. */
  isolated?: string | null;
  /** X-ray: every part except the selected one is see-through, to reveal inner structures. */
  xray?: boolean;
  hovered: string | null;
  timeSeconds: number;
  reducedMotion: boolean;
}

const HIGHLIGHT = new THREE.Color("#ffb020");
const SELECT = new THREE.Color("#2f80ed");
/** Opacity of the other parts while one part is focused: visible for context, clearly behind. */
export const GHOST_OPACITY = 0.12;
/** Opacity of parts in X-ray mode (stronger than a ghost: everything stays readable). */
export const XRAY_OPACITY = 0.3;

export class ComponentRegistry {
  private byId = new Map<string, RegisteredComponent>();
  private byObject = new WeakMap<THREE.Object3D, string>();

  /** Register every component whose mesh_name exists under `root`. Returns missing ids. */
  registerFrom(root: THREE.Object3D, components: readonly ResolvedComponent[]): string[] {
    root.updateWorldMatrix(true, true);
    const missing: string[] = [];
    for (const c of components) {
      if (this.byId.has(c.componentId)) continue;
      const object = root.getObjectByName(c.meshName);
      if (!object) {
        missing.push(c.componentId);
        continue;
      }
      const box = new THREE.Box3().setFromObject(object);
      const restCenter = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const localCenter = object.worldToLocal(restCenter.clone());
      const anchorWorld = c.meta?.label_anchor
        ? restCenter.clone().add(new THREE.Vector3(...c.meta.label_anchor))
        : restCenter.clone().add(new THREE.Vector3(0, size.y / 2 + 0.05, 0));
      const labelAnchor = object.worldToLocal(anchorWorld);

      const slots: MaterialSlot[] = [];
      object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const clone = (m: THREE.Material) => {
          const copy = m.clone();
          const em = (copy as THREE.MeshStandardMaterial).emissive;
          slots.push({
            material: copy,
            opacity: copy.opacity,
            transparent: copy.transparent,
            depthWrite: copy.depthWrite,
            emissive: em ? em.clone() : null,
            emissiveIntensity: (copy as THREE.MeshStandardMaterial).emissiveIntensity ?? 1,
          });
          return copy;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(clone)
          : clone(mesh.material);
        this.byObject.set(mesh, c.componentId);
      });
      this.byObject.set(object, c.componentId);
      this.byId.set(c.componentId, {
        component: c,
        object,
        basePosition: object.position.clone(),
        baseQuaternion: object.quaternion.clone(),
        localCenter,
        labelAnchor,
        restCenter,
        size,
        slots,
      });
    }
    return missing;
  }

  get(id: string): RegisteredComponent | undefined {
    return this.byId.get(id);
  }

  all(): RegisteredComponent[] {
    return [...this.byId.values()];
  }

  bounds(): ComponentBounds[] {
    return this.all().map((r) => ({
      id: r.component.componentId,
      center: r.restCenter.toArray() as Vec3,
      size: r.size.toArray() as Vec3,
    }));
  }

  /** component_id for a raycast hit, walking up to the registered node. */
  idFor(object: THREE.Object3D | null): string | null {
    for (let o = object; o; o = o.parent) {
      const id = this.byObject.get(o);
      if (id) return id;
    }
    return null;
  }

  labelPosition(id: string, target = new THREE.Vector3()): THREE.Vector3 | null {
    const r = this.byId.get(id);
    if (!r) return null;
    r.object.updateWorldMatrix(true, false);
    return r.object.localToWorld(target.copy(r.labelAnchor));
  }

  worldCenter(id: string, target = new THREE.Vector3()): THREE.Vector3 | null {
    const r = this.byId.get(id);
    if (!r) return null;
    r.object.updateWorldMatrix(true, false);
    return r.object.localToWorld(target.copy(r.localCenter));
  }

  isVisible(id: string): boolean {
    return this.byId.get(id)?.object.visible ?? false;
  }

  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpW = new THREE.Vector3();

  apply(view: ViewState): void {
    for (const r of this.byId.values()) {
      const id = r.component.componentId;
      const anim = view.frame.components[id];
      const o = r.object;

      // position: rest + exploded offset + animated translation
      o.position.copy(r.basePosition);
      const off = view.offsets[id];
      if (off) o.position.add(this.tmpV.set(off[0], off[1], off[2]).multiplyScalar(view.explode));
      if (anim?.translation) o.position.add(this.tmpV.set(...anim.translation));

      // rotation about the component's own centre
      o.quaternion.copy(r.baseQuaternion);
      if (anim?.rotation) {
        this.tmpQ.setFromEuler(this.tmpE.set(...anim.rotation));
        const c0 = this.tmpW.copy(r.localCenter).applyQuaternion(r.baseQuaternion);
        o.quaternion.premultiply(this.tmpQ);
        const c1 = this.tmpV.copy(r.localCenter).applyQuaternion(o.quaternion);
        o.position.add(c0).sub(c1);
      }

      const ghost =
        view.isolated && view.isolated !== id
          ? GHOST_OPACITY
          : view.xray && view.selected !== id
            ? XRAY_OPACITY
            : 1;
      const opacity = (anim?.opacity ?? 1) * ghost;
      o.visible = !view.hidden.has(id) && (anim?.visible ?? true) && opacity > 0.001;

      let glow = 0;
      let color = HIGHLIGHT;
      if (view.frame.highlight === id) {
        glow = view.reducedMotion ? 0.6 : 0.4 + 0.25 * Math.sin(view.timeSeconds * 5);
      } else if (view.selected === id) {
        glow = 0.45;
        color = SELECT;
      } else if (view.hovered === id) {
        glow = 0.2;
        color = SELECT;
      }

      for (const s of r.slots) {
        const m = s.material;
        const transparent = s.transparent || opacity < 0.999;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = s.opacity * opacity;
        m.depthWrite = s.depthWrite && opacity >= 0.999;
        const std = m as THREE.MeshStandardMaterial;
        if (s.emissive && std.emissive) {
          std.emissive.copy(s.emissive).lerp(color, glow);
          std.emissiveIntensity = s.emissiveIntensity + glow;
        }
      }
    }
  }

  dispose(): void {
    for (const r of this.byId.values()) for (const s of r.slots) s.material.dispose();
    this.byId.clear();
  }
}
