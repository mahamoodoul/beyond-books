/**
 * One speech player for the whole app (3D Studio tour, lesson "Listen", quiz "Read question").
 * Only one thing speaks at a time: starting a new reading cuts off the previous owner silently.
 * Audio comes from the backend's text-to-speech endpoint and is cached per text for the session.
 */
import { useSyncExternalStore } from "react";

import { apiBlob } from "@/api/client";

export interface SpeechState {
  /** Who is speaking (an id chosen by the caller), or null when idle. */
  owner: string | null;
  /** Position within the owner's list of texts. */
  index: number;
  total: number;
  loading: boolean;
  speaking: boolean;
  /** The server refused (no voice configured, rate limited): offer no more playback this session. */
  unavailable: boolean;
}

const IDLE: SpeechState = { owner: null, index: 0, total: 0, loading: false, speaking: false, unavailable: false };

/** A blob URL of 50 ms of silence (WAV), built here so no binary needs to ship. */
function silentClip(): string {
  const samples = 400;
  const bytes = new ArrayBuffer(44 + samples);
  const view = new DataView(bytes);
  const tag = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  tag(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  tag(36, "data");
  view.setUint32(40, samples, true);
  new Uint8Array(bytes, 44).fill(128); // 8-bit silence
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

/** How long a passing voice-service error (rate limit, vendor hiccup) disables the buttons. */
const RETRY_AFTER_MS = 15_000;

class SpeechPlayer {
  state: SpeechState = IDLE;
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private urls = new Map<string, Promise<string>>();
  private token = 0;
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getState = () => this.state;
  private set(patch: Partial<SpeechState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Fetch (and cache) the audio for a text; safe to call ahead of time. */
  load(text: string): Promise<string> {
    let p = this.urls.get(text);
    if (!p) {
      p = apiBlob("/speech", { text }).then((b) => URL.createObjectURL(b));
      p.catch(() => this.urls.delete(text));
      this.urls.set(text, p);
    }
    return p;
  }
  prefetch(text: string): void {
    void this.load(text).catch(() => undefined);
  }

  /**
   * Safari only lets an audio element play if play() ran during the click, and the speech arrives
   * after a network wait. Playing silence on the shared element at click time unlocks it for good.
   */
  private unlock(): void {
    if (this.unlocked) return;
    try {
      const a = (this.audio ??= new Audio());
      a.src = silentClip();
      void a.play().then(
        () => {
          this.unlocked = true;
        },
        () => undefined, // replaced by the real audio, or called outside a click: tried again next time
      );
    } catch {
      // no audio support: play() below reports the failure
    }
  }

  stop(): void {
    this.token += 1;
    const a = this.audio;
    if (a) {
      a.pause();
      a.onended = null;
      a.onerror = null;
    }
    if (this.state.owner !== null || this.state.speaking || this.state.loading) {
      this.set({ owner: null, index: 0, total: 0, loading: false, speaking: false });
    }
  }
  /** Stop only if `owner` is the one speaking. */
  stopIf(owner: string): void {
    if (this.state.owner === owner) this.stop();
  }

  /**
   * Read `texts` in order. `onStep(i)` fires before each piece, `onEnd(ok)` after the last one
   * (or at once with ok=false if playback failed). If something else starts in the meantime,
   * neither callback fires again.
   */
  play(owner: string, texts: string[], cb: { onStep?: (i: number) => void; onEnd?: (ok: boolean) => void } = {}): void {
    this.stop();
    this.unlock();
    const my = this.token;
    const list = texts.map((t) => t.trim()).filter(Boolean);
    if (list.length === 0) {
      cb.onEnd?.(false);
      return;
    }
    this.set({ owner, index: 0, total: list.length, loading: true, speaking: false });
    void (async () => {
      let ok = true;
      try {
        for (let i = 0; i < list.length; i++) {
          if (my !== this.token) return;
          cb.onStep?.(i);
          this.set({ index: i, loading: true });
          const url = await this.load(list[i]!);
          if (my !== this.token) return;
          if (i + 1 < list.length) this.prefetch(list[i + 1]!);
          const a = (this.audio ??= new Audio());
          a.src = url;
          const done = new Promise<boolean>((resolve) => {
            a.onended = () => resolve(true);
            a.onerror = () => resolve(false);
          });
          await a.play();
          if (my !== this.token) return;
          this.set({ loading: false, speaking: true, unavailable: false });
          ok = await done;
          if (!ok) break;
        }
      } catch (e) {
        if (my !== this.token) return;
        const status = (e as { status?: number }).status;
        if (status === 503 || status === 429 || status === 502) this.set({ unavailable: true });
        if (status === 429 || status === 502) setTimeout(() => this.set({ unavailable: false }), RETRY_AFTER_MS);
        ok = false;
      }
      if (my !== this.token) return;
      this.set({ owner: null, index: 0, total: 0, loading: false, speaking: false });
      cb.onEnd?.(ok);
    })();
  }
}

export const speechPlayer = new SpeechPlayer();

/** Live player state for components (re-renders on every change). */
export function useSpeechPlayer(): SpeechState {
  return useSyncExternalStore(speechPlayer.subscribe, speechPlayer.getState, speechPlayer.getState);
}
