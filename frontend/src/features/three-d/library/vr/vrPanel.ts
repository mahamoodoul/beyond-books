/**
 * Text and buttons inside the headset, where DOM elements cannot appear. Each is a flat quad with a
 * canvas texture that is redrawn only when its content changes, so an idle panel costs one draw.
 * They ignore depth, so they stay readable even when the model has been enlarged around them.
 */
import * as THREE from "three";

export interface VrButton {
  id: string;
  label: string;
  active?: boolean;
  run: () => void;
}

export interface VrPanelContent {
  kicker: string;
  counter: string;
  title: string;
  body: string;
  note?: string;
  buttons: readonly VrButton[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 1280;
const H = 800;
const WIDTH_M = 1;
const MARGIN = 48;
const GAP = 16;
const BUTTON_H = 84;
const PER_ROW = 5;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const INK = "#f1f5f9";
const MUTED = "#94a3b8";
const TEAL = "#38b2ac";

/** Button rectangles in canvas pixels: rows of five, anchored to the bottom of the panel. */
export function layoutButtons(count: number): Rect[] {
  const rows = Math.ceil(count / PER_ROW);
  const w = (W - MARGIN * 2 - GAP * (PER_ROW - 1)) / PER_ROW;
  const top = H - 40 - rows * BUTTON_H - (rows - 1) * GAP;
  return Array.from({ length: count }, (_, i) => ({
    x: MARGIN + (i % PER_ROW) * (w + GAP),
    y: top + Math.floor(i / PER_ROW) * (BUTTON_H + GAP),
    w,
    h: BUTTON_H,
  }));
}

/** Index of the button at texture coordinates (u right, v up), or -1. */
export function buttonAt(rects: readonly Rect[], u: number, v: number): number {
  const x = u * W;
  const y = (1 - v) * H;
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function makeTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function overlayMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  const words = text.split(/\s+/).filter(Boolean);
  for (const [i, word] of words.entries()) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[\s,.;:]+$/, "")}…`;
      return lines;
    }
    if (i === words.length - 1) break;
  }
  if (line) lines.push(line);
  return lines;
}

export class VrPanel {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas = document.createElement("canvas");
  private rects: Rect[] = [];
  private drawn = "";

  constructor(anisotropy: number) {
    this.canvas.width = W;
    this.canvas.height = H;
    const geometry = new THREE.PlaneGeometry(WIDTH_M, (WIDTH_M * H) / W);
    this.mesh = new THREE.Mesh(geometry, overlayMaterial(makeTexture(this.canvas, anisotropy)));
    this.mesh.renderOrder = 1000;
  }

  buttonIndexAt(u: number, v: number): number {
    return buttonAt(this.rects, u, v);
  }

  /** Redraws only when something visible changed. */
  draw(content: VrPanelContent, hover: number): void {
    const key = JSON.stringify([
      content.kicker,
      content.counter,
      content.title,
      content.body,
      content.note,
      content.buttons.map((b) => [b.label, b.active]),
      hover,
    ]);
    if (key === this.drawn) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    this.drawn = key;
    this.rects = layoutButtons(content.buttons.length);

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 36);
    ctx.fill();
    ctx.textBaseline = "top";

    ctx.textAlign = "left";
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = TEAL;
    ctx.fillText(content.kicker, MARGIN, 40, W - MARGIN * 2 - 140);
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.fillText(content.counter, W - MARGIN, 40);

    ctx.textAlign = "left";
    ctx.font = `700 58px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(content.title, MARGIN, 86, W - MARGIN * 2);

    const bottom = (this.rects[0]?.y ?? H) - 24;
    let y = 170;
    const lineH = 44;
    const room = Math.max(1, Math.floor((bottom - y) / lineH));
    ctx.font = `400 34px ${FONT}`;
    ctx.fillStyle = "#cbd5e1";
    const noteLines = content.note ? Math.min(3, Math.floor(room / 3)) : 0;
    for (const line of wrap(ctx, content.body, W - MARGIN * 2, room - noteLines)) {
      ctx.fillText(line, MARGIN, y);
      y += lineH;
    }
    if (content.note && noteLines > 0) {
      ctx.fillStyle = TEAL;
      for (const line of wrap(ctx, content.note, W - MARGIN * 2, noteLines)) {
        ctx.fillText(line, MARGIN, y);
        y += lineH;
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 32px ${FONT}`;
    content.buttons.forEach((b, i) => {
      const r = this.rects[i]!;
      ctx.fillStyle = b.active ? TEAL : i === hover ? "#334155" : "#1e293b";
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      if (i === hover) {
        ctx.strokeStyle = b.active ? INK : TEAL;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.fillStyle = b.active ? "#0b0d16" : INK;
      ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 16);
    });
    this.mesh.material.map!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * The floor: rings every half metre that fade into the backdrop, so the room has no hard edge. A
 * mipmapped texture rather than grid lines, because one-pixel lines shimmer badly in a headset.
 */
export function makeFloorTexture(backdrop: string, radiusMetres: number, anisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const perMetre = c / radiusMetres;
    // lighter than the backdrop: at a distance the mipmaps blend the rings away, and this tone
    // is what still reads as ground
    ctx.fillStyle = "#2c323d";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 4;
    for (let r = 0.5; r < radiusMetres; r += 0.5) {
      ctx.beginPath();
      ctx.arc(c, c, r * perMetre, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * perMetre * 0.5, c + Math.sin(a) * perMetre * 0.5);
      ctx.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      ctx.stroke();
    }
    const fade = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
    fade.addColorStop(0, `${backdrop}00`);
    fade.addColorStop(1, backdrop);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
  }
  return makeTexture(canvas, anisotropy);
}

const TAG_W = 720;
const TAG_H = 112;
const TAG_WIDTH_M = 0.42;

/** The name of the part being pointed at or selected, floating just above that part. */
export class VrPartTag {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas = document.createElement("canvas");
  private drawn: string | null = null;

  constructor(anisotropy: number) {
    this.canvas.width = TAG_W;
    this.canvas.height = TAG_H;
    const geometry = new THREE.PlaneGeometry(TAG_WIDTH_M, (TAG_WIDTH_M * TAG_H) / TAG_W);
    this.mesh = new THREE.Mesh(geometry, overlayMaterial(makeTexture(this.canvas, anisotropy)));
    this.mesh.renderOrder = 1001;
    this.mesh.visible = false;
  }

  draw(text: string): void {
    if (text === this.drawn) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    this.drawn = text;
    ctx.clearRect(0, 0, TAG_W, TAG_H);
    ctx.font = `600 52px ${FONT}`;
    const width = Math.min(TAG_W - 8, ctx.measureText(text).width + 72);
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    ctx.beginPath();
    ctx.roundRect((TAG_W - width) / 2, 4, width, TAG_H - 8, 24);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, TAG_W / 2, TAG_H / 2 + 2, TAG_W - 56);
    this.mesh.material.map!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}
