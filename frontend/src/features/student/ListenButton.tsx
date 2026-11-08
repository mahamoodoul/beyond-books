/**
 * "Listen" for any piece of learning text (a lesson, one of its parts, a quiz question). All
 * buttons share the app's one speech player, so pressing one stops whatever else was reading.
 * Renders nothing when the server has no voice configured.
 */
import { Icon } from "@/components/ui/Icon";
import { speechPlayer, useSpeechPlayer } from "@/features/three-d/library/speech/player";
import { useSpeechEnabled } from "@/features/three-d/library/speech/useNarrator";

export function ListenButton({
  id,
  texts,
  label = "Listen",
  compact = false,
  className = "",
}: {
  /** Unique per thing that can be read, e.g. `lesson:<id>` or `quiz:<id>:<question>`. */
  id: string;
  texts: string[];
  label?: string;
  /** Small pill for inside a card header. */
  compact?: boolean;
  className?: string;
}) {
  const enabled = useSpeechEnabled();
  const st = useSpeechPlayer();
  if (!enabled || texts.length === 0) return null;
  const mine = st.owner === id;
  const text = st.unavailable
    ? "Voice unavailable"
    : mine
      ? st.loading
        ? "Loading…"
        : st.total > 1
          ? `Reading ${st.index + 1}/${st.total} · Stop`
          : "Stop"
      : label;
  const base = compact
    ? "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition"
    : "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition";
  const tone = mine
    ? "border-[#38b2ac] bg-teal-50 text-teal-800"
    : "border-slate-200 bg-white text-slate-700 hover:border-[#38b2ac] hover:text-slate-900";
  return (
    <button
      type="button"
      aria-pressed={mine}
      disabled={st.unavailable}
      title={st.unavailable ? "Voice narration is not available right now" : mine ? "Stop reading" : "Read this aloud"}
      className={`${base} ${tone} disabled:opacity-50 ${className}`}
      onClick={() => (mine ? speechPlayer.stop() : speechPlayer.play(id, texts))}
    >
      <Icon name={mine ? "pause" : "volume"} size={compact ? 13 : 15} />
      <span style={{ color: "inherit" }}>{text}</span>
    </button>
  );
}
