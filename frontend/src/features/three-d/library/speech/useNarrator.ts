/**
 * Voice narration for the Studio viewer: a thin per-viewer handle on the app's single speech
 * player, so the tour, the lesson "Listen" button and the quiz never talk over each other.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";

import { api } from "@/api/client";
import type { SpeechStatus } from "@/api/generated/schema";

import { chunk } from "./chunk";
import { speechPlayer, useSpeechPlayer } from "./player";

/** True when the server has a voice configured, so voice controls are worth showing. */
export function useSpeechEnabled(): boolean {
  const q = useQuery({
    queryKey: ["speech-status"],
    queryFn: () => api.get<SpeechStatus>("/speech/status"),
    staleTime: Infinity,
    retry: false,
  });
  return q.data?.enabled ?? false;
}

export interface Narrator {
  /** Read `text`; `onEnd(ok)` fires when playback finishes, or at once with ok=false if it could not play. */
  speak: (text: string, onEnd?: (ok: boolean) => void) => void;
  stop: () => void;
  /** Fetch the audio for `text` now so it starts instantly later (the next tour step). */
  prefetch: (text: string) => void;
  speaking: boolean;
  /** The server refused (not configured, rate limited): the UI should say so instead of staying silent. */
  unavailable: boolean;
}

export function useNarrator(): Narrator {
  const owner = useId();
  const state = useSpeechPlayer();
  const speak = useCallback(
    (text: string, onEnd?: (ok: boolean) => void) => speechPlayer.play(owner, chunk(text), { onEnd }),
    [owner],
  );
  const stop = useCallback(() => speechPlayer.stopIf(owner), [owner]);
  const prefetch = useCallback((text: string) => {
    for (const piece of chunk(text)) speechPlayer.prefetch(piece);
  }, []);
  useEffect(() => () => speechPlayer.stopIf(owner), [owner]);
  return {
    speak,
    stop,
    prefetch,
    speaking: state.owner === owner && state.speaking,
    unavailable: state.unavailable,
  };
}
