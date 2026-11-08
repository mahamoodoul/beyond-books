/**
 * Where the model stands in a VR room. The camera belongs to the headset and is never moved (moving
 * it makes people sick), so everything the learner does moves this "stage" instead: its anchor is
 * the model's centre, in metres. Pure maths, kept free of WebXR so it can be unit-tested.
 */
import * as THREE from "three";

export const VR_LAYOUT = {
  /** The whole model starts as a sphere of this radius (metres): big, but within arm's reach. */
  modelRadius: 0.6,
  /** Distance from the eyes to the model's centre at the start. */
  modelDistance: 1.3,
  /** The centre sits a little below eye level, so the learner looks slightly down at it. */
  modelDrop: 0.15,
  panelDistance: 1.25,
  /** The panel stands to the left of the model, out of its way. */
  panelAngle: THREE.MathUtils.degToRad(50),
  panelDrop: 0.1,
  /** Eye height assumed when the headset doesn't report where the floor is. */
  eyeHeight: 1.4,
  /** Zoom range relative to the starting size: from desk toy to walking inside it. */
  minZoom: 0.15,
  maxZoom: 8,
};

export interface StagePose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
}

export interface HandPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const UP = new THREE.Vector3(0, 1, 0);

export function copyPose(p: StagePose): StagePose {
  return { position: p.position.clone(), quaternion: p.quaternion.clone(), scale: p.scale };
}

export function clampScale(scale: number, fit: number): number {
  return THREE.MathUtils.clamp(scale, fit * VR_LAYOUT.minZoom, fit * VR_LAYOUT.maxZoom);
}

/** Size that makes a model of this radius fill the starting sphere. */
export function fitScale(radius: number): number {
  return VR_LAYOUT.modelRadius / (radius > 0 ? radius : 1);
}

/** Level unit vector for where the head faces, even when the learner is looking straight down. */
export function levelForward(forward: THREE.Vector3): THREE.Vector3 {
  const level = new THREE.Vector3(forward.x, 0, forward.z);
  return level.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, -1) : level.normalize();
}

/** The starting pose: in front of the head, with the model's front (or its own view) facing it. */
export function placeInFront(
  head: THREE.Vector3,
  forward: THREE.Vector3,
  radius: number,
  frontDirection: readonly [number, number, number] = [0, 0, 1],
): StagePose {
  const level = levelForward(forward);
  const position = head.clone().addScaledVector(level, VR_LAYOUT.modelDistance);
  position.y = head.y - VR_LAYOUT.modelDrop;
  const yaw = Math.atan2(-level.x, -level.z) - Math.atan2(frontDirection[0], frontDirection[2]);
  return { position, quaternion: new THREE.Quaternion().setFromAxisAngle(UP, yaw), scale: fitScale(radius) };
}

/** Where the control panel stands, and the point it should face. */
export function panelSpot(head: THREE.Vector3, forward: THREE.Vector3): THREE.Vector3 {
  const dir = levelForward(forward).applyAxisAngle(UP, VR_LAYOUT.panelAngle);
  const spot = head.clone().addScaledVector(dir, VR_LAYOUT.panelDistance);
  spot.y = head.y - VR_LAYOUT.panelDrop;
  return spot;
}

/** One hand holding the model: it follows the hand as if it were rigidly attached. */
export function grabOne(start: StagePose, from: HandPose, to: HandPose): StagePose {
  const turn = to.quaternion.clone().multiply(from.quaternion.clone().invert());
  return {
    position: start.position.clone().sub(from.position).applyQuaternion(turn).add(to.position),
    quaternion: turn.multiply(start.quaternion).normalize(),
    scale: start.scale,
  };
}

const headingOf = (v: THREE.Vector3) => Math.atan2(v.x, v.z);

/**
 * Two hands: pulling them apart zooms, and turning them around each other spins the model about the
 * vertical only, so it can't tip over by accident. The point between the hands stays put.
 */
export function grabTwo(
  start: StagePose,
  from: readonly [HandPose, HandPose],
  to: readonly [HandPose, HandPose],
  fit: number,
): StagePose {
  const spanFrom = to3(from[1]).sub(from[0].position);
  const spanTo = to3(to[1]).sub(to[0].position);
  const before = spanFrom.length();
  const scale = before > 1e-4 ? clampScale((start.scale * spanTo.length()) / before, fit) : start.scale;
  const zoom = scale / start.scale;
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, headingOf(spanTo) - headingOf(spanFrom));
  const midFrom = to3(from[0]).add(from[1].position).multiplyScalar(0.5);
  const midTo = to3(to[0]).add(to[1].position).multiplyScalar(0.5);
  return {
    position: start.position.clone().sub(midFrom).multiplyScalar(zoom).applyQuaternion(turn).add(midTo),
    quaternion: turn.multiply(start.quaternion).normalize(),
    scale,
  };
}

function to3(h: HandPose): THREE.Vector3 {
  return h.position.clone();
}

/** Thumbstick: left/right spins the model on the spot, up/down zooms it. */
export function applyStick(pose: StagePose, x: number, y: number, dt: number, fit: number): void {
  const deadzone = 0.2;
  if (Math.abs(x) > deadzone) {
    pose.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, x * 1.6 * dt)).normalize();
  }
  if (Math.abs(y) > deadzone) pose.scale = clampScale(pose.scale * Math.exp(-y * 1.2 * dt), fit);
}
