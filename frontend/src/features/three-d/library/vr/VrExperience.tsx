/**
 * Immersive VR for the 3D viewer, on plain WebXR (no extra runtime and nothing fetched from a CDN).
 *
 * The model stands in the room at a real size and the learner walks around it. Point and pull the
 * trigger to pick a part or press a panel button; grip (or pinch on empty space) to hold the model;
 * two hands zoom and spin it; the thumbstick does the same without holding. The headset owns the
 * camera throughout, and the viewer's own camera is put back on exit.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { STUDIO_BACKDROP } from "@/features/three-d/library/runtime/quality";
import { viewBounds, type ViewerRuntime } from "@/features/three-d/library/runtime/viewerRuntime";

import { makeFloorTexture, VrPanel, VrPartTag, type VrButton, type VrPanelContent } from "./vrPanel";
import {
  applyStick,
  copyPose,
  fitScale,
  grabOne,
  grabTwo,
  panelSpot,
  placeInFront,
  type HandPose,
  type StagePose,
  VR_LAYOUT,
} from "./vrStage";

/** What the viewer shows and offers inside the headset. */
export interface VrUi extends VrPanelContent {
  partLabel: (componentId: string) => string;
}

export interface VrExperienceProps {
  roots: readonly THREE.Object3D[];
  stage: RefObject<THREE.Group | null>;
  pivot: RefObject<THREE.Group | null>;
  runtime: RefObject<ViewerRuntime>;
  ui: VrUi | null;
  canSelect: (componentId: string) => boolean;
  onSelect: (componentId: string) => void;
  onActiveChange: (active: boolean) => void;
  onError: (message: string) => void;
}

type Hit = { kind: "panel"; button: number; distance: number } | { kind: "part"; id: string; distance: number };

interface Input {
  ray: THREE.Group;
  line: THREE.Line;
  cursor: THREE.Mesh;
  source: XRInputSource | null;
  hit: Hit | null;
  /** Holding the model with this hand: by the grip, or by the trigger on empty space. */
  gripping: boolean;
  triggerGrab: boolean;
}

const RAY_LENGTH = 3;
const FLOOR_RADIUS = 6;
const RAY_COLOR = "#38b2ac";

function handPose(input: Input): HandPose {
  input.ray.updateWorldMatrix(true, false);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  input.ray.matrixWorld.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
}

export function VrExperience(props: VrExperienceProps) {
  const { runtime, stage, pivot } = props;
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const rig = useRef<THREE.Group>(null);
  const floor = useRef<THREE.Group>(null);
  // handlers live outside React's render cycle: always read the latest props through this
  const latest = useRef(props);
  latest.current = props;

  const anisotropy = gl.capabilities.getMaxAnisotropy();
  const panel = useMemo(() => new VrPanel(Math.min(8, anisotropy)), [anisotropy]);
  const tag = useMemo(() => new VrPartTag(Math.min(8, anisotropy)), [anisotropy]);
  const floorTexture = useMemo(() => makeFloorTexture(STUDIO_BACKDROP, FLOOR_RADIUS, Math.min(8, anisotropy)), [anisotropy]);
  useEffect(
    () => () => {
      panel.dispose();
      tag.dispose();
      floorTexture.dispose();
    },
    [panel, tag, floorTexture],
  );

  const inputs = useRef<Input[]>([]);
  const pose = useRef<StagePose | null>(null);
  const fit = useRef(1);
  const needsPlacing = useRef(false);
  const frameCount = useRef(0);
  const grab = useRef<{ start: StagePose; hands: Input[]; from: HandPose[] } | null>(null);
  const raycaster = useMemo(() => {
    const r = new THREE.Raycaster();
    r.firstHitOnly = true;
    r.far = 30;
    return r;
  }, []);
  const tmp = useMemo(
    () => ({ origin: new THREE.Vector3(), dir: new THREE.Vector3(), label: new THREE.Vector3(), q: new THREE.Quaternion() }),
    [],
  );

  const allButtons = (): VrButton[] => [
    ...(latest.current.ui?.buttons ?? []),
    { id: "vr-reset", label: "Reset", run: () => (needsPlacing.current = true) },
    { id: "vr-exit", label: "Exit VR", run: () => void gl.xr.getSession()?.end() },
  ];

  const castRay = (input: Input): Hit | null => {
    input.ray.updateWorldMatrix(true, false);
    tmp.origin.setFromMatrixPosition(input.ray.matrixWorld);
    tmp.dir.set(0, 0, -1).transformDirection(input.ray.matrixWorld);
    raycaster.set(tmp.origin, tmp.dir);
    raycaster.camera = gl.xr.getCamera();
    // the panel floats above everything, so it takes the ray first
    const onPanel = raycaster.intersectObject(panel.mesh, false)[0];
    if (onPanel?.uv) return { kind: "panel", button: panel.buttonIndexAt(onPanel.uv.x, onPanel.uv.y), distance: onPanel.distance };
    const { roots, canSelect } = latest.current;
    const rt = runtime.current;
    for (const hit of raycaster.intersectObjects(roots as THREE.Object3D[], true)) {
      const id = rt.registry.idFor(hit.object);
      if (id && rt.registry.isVisible(id) && canSelect(id)) return { kind: "part", id, distance: hit.distance };
    }
    return null;
  };

  const restartGrab = () => {
    const hands = inputs.current.filter((i) => i.gripping || i.triggerGrab);
    grab.current =
      hands.length > 0 && pose.current
        ? { start: copyPose(pose.current), hands, from: hands.map(handPose) }
        : null;
  };

  // ---- controllers and hands. Registered up front so no "connected" event can be missed.
  useEffect(() => {
    const group = rig.current;
    if (!group) return;
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: RAY_COLOR, transparent: true, opacity: 0.75, depthTest: false });
    const cursorGeometry = new THREE.SphereGeometry(0.008, 12, 8);
    const cursorMaterial = new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, depthTest: false, toneMapped: false });
    const handleGeometry = new THREE.CapsuleGeometry(0.018, 0.09, 4, 12);
    const handleMaterial = new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.6 });
    const undo: (() => void)[] = [];

    for (const index of [0, 1]) {
      const ray = gl.xr.getController(index);
      const grip = gl.xr.getControllerGrip(index);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.renderOrder = 1002;
      line.raycast = () => {};
      line.scale.z = RAY_LENGTH;
      const cursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
      cursor.renderOrder = 1003;
      cursor.raycast = () => {};
      ray.add(line, cursor);
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      handle.rotation.x = Math.PI / 2;
      grip.add(handle);
      group.add(ray, grip);

      const input: Input = { ray, line, cursor, source: null, hit: null, gripping: false, triggerGrab: false };
      inputs.current.push(input);

      const connected = (e: { data?: XRInputSource }) => {
        input.source = e.data ?? null;
      };
      const disconnected = () => {
        input.source = null;
        input.gripping = false;
        input.triggerGrab = false;
        restartGrab();
      };
      const selectStart = () => {
        const hit = castRay(input);
        input.hit = hit;
        if (hit?.kind === "panel") {
          if (hit.button >= 0) allButtons()[hit.button]?.run();
          return;
        }
        if (hit?.kind === "part") {
          latest.current.onSelect(hit.id);
          return;
        }
        input.triggerGrab = true;
        restartGrab();
      };
      const selectEnd = () => {
        if (!input.triggerGrab) return;
        input.triggerGrab = false;
        restartGrab();
      };
      const squeezeStart = () => {
        input.gripping = true;
        restartGrab();
      };
      const squeezeEnd = () => {
        input.gripping = false;
        restartGrab();
      };
      const on = (name: string, fn: (e: { data?: XRInputSource }) => void) => {
        const target = ray as unknown as THREE.EventDispatcher<Record<string, { data?: XRInputSource }>>;
        target.addEventListener(name, fn);
        undo.push(() => target.removeEventListener(name, fn));
      };
      on("connected", connected);
      on("disconnected", disconnected);
      on("selectstart", selectStart);
      on("selectend", selectEnd);
      on("squeezestart", squeezeStart);
      on("squeezeend", squeezeEnd);
      undo.push(() => {
        ray.remove(line, cursor);
        grip.remove(handle);
        group.remove(ray, grip);
      });
    }
    return () => {
      undo.forEach((fn) => fn());
      inputs.current = [];
      lineGeometry.dispose();
      lineMaterial.dispose();
      cursorGeometry.dispose();
      cursorMaterial.dispose();
      handleGeometry.dispose();
      handleMaterial.dispose();
    };
  }, [gl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- entering and leaving
  useEffect(() => {
    const rt = runtime.current;
    const saved = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    };
    const restore = () => {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.near = saved.near;
      camera.far = saved.far;
      camera.updateProjectionMatrix();
      const s = stage.current;
      s?.position.set(0, 0, 0);
      s?.quaternion.identity();
      s?.scale.setScalar(1);
      if (s) s.visible = true;
      pivot.current?.position.set(0, 0, 0);
      if (rig.current) rig.current.visible = false;
      pose.current = null;
      grab.current = null;
      rt.hovered = null;
      latest.current.onActiveChange(false);
    };
    const onEnd = () => restore();
    gl.xr.addEventListener("sessionend", onEnd);

    rt.enterVr = async () => {
      const xr = navigator.xr;
      if (!xr || gl.xr.getSession()) return;
      let session: XRSession | null = null;
      try {
        // must stay the first await: browsers only allow this directly from the user's click
        session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
        const features = session.enabledFeatures;
        gl.xr.setReferenceSpaceType(!features || features.includes("local-floor") ? "local-floor" : "local");
        saved.position.copy(camera.position);
        saved.quaternion.copy(camera.quaternion);
        saved.fov = camera.fov;
        saved.near = camera.near;
        saved.far = camera.far;
        // a tight depth range keeps nested shells from flickering at headset resolution
        camera.near = 0.05;
        camera.far = 100;
        if (stage.current) stage.current.visible = false; // until it has been placed in the room
        needsPlacing.current = true;
        // before the session: post-processing must be gone by the first headset frame
        latest.current.onActiveChange(true);
        await gl.xr.setSession(session);
      } catch (err) {
        if (session) {
          gl.xr.removeEventListener("sessionend", onEnd);
          await session.end().catch(() => undefined);
          gl.xr.addEventListener("sessionend", onEnd);
          restore();
        }
        latest.current.onError(err instanceof Error ? err.message : "VR could not start on this device.");
      }
    };
    return () => {
      rt.enterVr = null;
      gl.xr.removeEventListener("sessionend", onEnd);
      void gl.xr.getSession()?.end();
    };
  }, [gl, camera, runtime, stage, pivot]);

  // ---- every headset frame
  useFrame((_, delta, frame?: XRFrame) => {
    if (!gl.xr.isPresenting) return;
    const rt = runtime.current;
    const dt = Math.min(delta, 0.1);

    if (needsPlacing.current) {
      const space = gl.xr.getReferenceSpace();
      const viewer = space ? frame?.getViewerPose(space) : undefined;
      if (!viewer) return; // tracking hasn't started: the model stays hidden until it has
      const p = viewer.transform.position;
      const o = viewer.transform.orientation;
      const head = new THREE.Vector3(p.x, p.y, p.z);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
      const bounds = viewBounds(rt, 0);
      pivot.current?.position.set(-bounds.center[0], -bounds.center[1], -bounds.center[2]);
      fit.current = fitScale(bounds.radius);
      pose.current = placeInFront(head, forward, bounds.radius, rt.ownView?.direction);
      grab.current = null;
      panel.mesh.position.copy(panelSpot(head, forward));
      panel.mesh.lookAt(head);
      if (floor.current) floor.current.position.y = hasNoFloor(gl) ? head.y - VR_LAYOUT.eyeHeight : 0;
      needsPlacing.current = false;
      if (stage.current) stage.current.visible = true;
      if (rig.current) rig.current.visible = true;
    }

    const current = pose.current;
    if (!current) return;

    // ---- pointing. The two rays take turns, which halves the raycast cost on heavy models.
    frameCount.current += 1;
    let hovered: string | null = null;
    let hoverButton = -1;
    inputs.current.forEach((input, i) => {
      const live = input.source !== null;
      input.line.visible = live;
      input.cursor.visible = false;
      if (!live) return;
      if ((frameCount.current + i) % 2 === 0) input.hit = castRay(input);
      const hit = input.hit;
      if (hit?.kind === "panel" && hit.button >= 0) hoverButton = hit.button;
      if (hit?.kind === "part") hovered = hit.id;
      const distance = hit?.distance ?? RAY_LENGTH;
      input.line.scale.z = distance;
      input.cursor.visible = hit !== null;
      input.cursor.position.z = -distance;
    });
    rt.hovered = hovered;

    // ---- holding, or the thumbsticks when not holding
    const held = grab.current;
    if (held && held.hands.length === 1) {
      Object.assign(current, grabOne(held.start, held.from[0]!, handPose(held.hands[0]!)));
    } else if (held && held.hands.length >= 2) {
      const to = [handPose(held.hands[0]!), handPose(held.hands[1]!)] as const;
      Object.assign(current, grabTwo(held.start, [held.from[0]!, held.from[1]!], to, fit.current));
    } else {
      for (const input of inputs.current) {
        const axes = input.source?.gamepad?.axes;
        if (!axes) continue;
        // xr-standard controllers put the thumbstick on axes 2 and 3; touchpads use 0 and 1
        const x = axes[2] ?? axes[0] ?? 0;
        const y = axes[3] ?? axes[1] ?? 0;
        applyStick(current, x, y, dt, fit.current);
      }
    }
    const s = stage.current;
    if (s) {
      s.position.copy(current.position);
      s.quaternion.copy(current.quaternion);
      s.scale.setScalar(current.scale);
    }

    // ---- name tag and panel
    const ui = latest.current.ui;
    const named = hovered ?? rt.selected;
    const anchor = named ? rt.registry.labelPosition(named, tmp.label) : null;
    if (ui && named && anchor) {
      tag.draw(ui.partLabel(named));
      tag.mesh.position.copy(anchor);
      tag.mesh.position.y += 0.06;
      gl.xr.getCamera().getWorldQuaternion(tmp.q);
      tag.mesh.quaternion.copy(tmp.q);
      tag.mesh.visible = true;
    } else {
      tag.mesh.visible = false;
    }
    if (ui) panel.draw({ ...ui, buttons: allButtons() }, hoverButton);
  });

  return (
    <group ref={rig} visible={false}>
      <primitive object={panel.mesh} />
      <primitive object={tag.mesh} />
      {/* a still floor gives the eyes a fixed reference, which is what prevents motion sickness */}
      <group ref={floor}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <circleGeometry args={[FLOOR_RADIUS, 48]} />
          <meshBasicMaterial map={floorTexture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** True when the headset doesn't know where the floor is, so the grid must be placed by estimate. */
function hasNoFloor(gl: THREE.WebGLRenderer): boolean {
  const features = gl.xr.getSession()?.enabledFeatures;
  return !!features && !features.includes("local-floor");
}
