/**
 * Plays animation clips baked into a GLB (play_clip steps). The time comes from the animation
 * timeline, not the wall clock, so pause / step / restart stay exact.
 *
 * Clips should animate nodes *inside* a component (e.g. each piston under `pistons`): the
 * component nodes themselves are positioned every frame by the ComponentRegistry (explode,
 * rotate/move steps), which would override a clip on the same node.
 */
import * as THREE from "three";

interface Rest {
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export class ClipPlayer {
  private clips = new Map<string, { clip: THREE.AnimationClip; mixer: THREE.AnimationMixer }>();
  private mixers: THREE.AnimationMixer[] = [];
  private rest: Rest[] = [];
  private action: THREE.AnimationAction | null = null;
  private playing: string | null = null;

  constructor(roots: readonly THREE.Object3D[]) {
    const seen = new Set<THREE.Object3D>();
    for (const root of roots) {
      if (!root.animations?.length) continue;
      const mixer = new THREE.AnimationMixer(root);
      this.mixers.push(mixer);
      for (const clip of root.animations) {
        if (!this.clips.has(clip.name)) this.clips.set(clip.name, { clip, mixer });
        // remember the rest pose of every animated node, to restore it when the clip stops
        for (const track of clip.tracks) {
          const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
          const o = nodeName ? root.getObjectByName(nodeName) : undefined;
          if (o && !seen.has(o)) {
            seen.add(o);
            this.rest.push({
              object: o,
              position: o.position.clone(),
              quaternion: o.quaternion.clone(),
              scale: o.scale.clone(),
            });
          }
        }
      }
    }
  }

  get names(): string[] {
    return [...this.clips.keys()];
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  /** Show `clip` at its time, or the rest pose for null (or a clip the model doesn't have). */
  apply(clip: { name: string; time: number; loop: boolean } | null): void {
    const entry = clip ? this.clips.get(clip.name) : undefined;
    if (!clip || !entry) {
      if (this.playing !== null) this.stop();
      return;
    }
    if (this.playing !== clip.name) {
      this.stop();
      this.action = entry.mixer.clipAction(entry.clip);
      this.action.setLoop(THREE.LoopRepeat, Infinity);
      this.action.play();
      this.playing = clip.name;
    }
    const d = entry.clip.duration;
    let t = Math.max(0, clip.time);
    if (d > 0) t = clip.loop ? t % d : Math.min(t, d - 1e-4);
    this.action!.time = t;
    entry.mixer.update(0);
  }

  private stop(): void {
    this.action?.stop();
    this.action = null;
    this.playing = null;
    for (const r of this.rest) {
      r.object.position.copy(r.position);
      r.object.quaternion.copy(r.quaternion);
      r.object.scale.copy(r.scale);
    }
  }

  dispose(): void {
    this.stop();
    for (const m of this.mixers) {
      m.stopAllAction();
      m.uncacheRoot(m.getRoot());
    }
    this.mixers = [];
    this.clips.clear();
  }
}
