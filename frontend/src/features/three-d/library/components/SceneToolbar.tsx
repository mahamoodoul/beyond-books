import type { QualitySetting, QualityTier } from "@/features/three-d/library/runtime/quality";
import type { VrAvailability } from "@/features/three-d/library/vr/useVrAvailability";

export interface SceneToolbarProps {
  quality: QualitySetting;
  effectiveTier: QualityTier;
  onQuality: (q: QualitySetting) => void;
  showLabels: boolean;
  onShowLabels: (v: boolean) => void;
  explode: number | null;
  /** `scrub`: the slider is being dragged, so follow it directly rather than animating there. */
  onExplode: (v: number, scrub?: boolean) => void;
  onExplodeCommit: () => void;
  /** The model's own looping animation (e.g. a running engine), when it has one. */
  runLabel?: string;
  running?: boolean;
  onRun?: () => void;
  onResetView: () => void;
  onFullscreen?: () => void;
  vr?: VrAvailability;
  onEnterVr?: () => void;
  /** Studio tools (optional): X-ray and a guided tour through the parts. */
  xray?: boolean;
  onXray?: (v: boolean) => void;
  touring?: boolean;
  onTour?: () => void;
  /** Voice narration (only offered when the server has a voice configured). */
  voice?: boolean;
  onVoice?: (v: boolean) => void;
  speaking?: boolean;
  voiceUnavailable?: boolean;
}

export const VR_HINT: Record<Exclude<VrAvailability, "checking" | "ready">, { label: string; title: string }> = {
  "no-headset": {
    label: "VR: no headset",
    title: "Open this page in the browser of a VR headset, or connect a PC VR headset, to view the model in VR",
  },
  "needs-https": {
    label: "VR needs HTTPS",
    title: "VR headsets only work on secure pages: open this site at its https:// address",
  },
};

const btn =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent";

export function SceneToolbar({
  showLabels,
  onShowLabels,
  explode,
  onExplode,
  onExplodeCommit,
  runLabel,
  running,
  onRun,
  onResetView,
  onFullscreen,
  vr,
  onEnterVr,
  quality,
  effectiveTier,
  onQuality,
  xray,
  onXray,
  touring,
  onTour,
  voice,
  onVoice,
  speaking,
  voiceUnavailable,
}: SceneToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="toolbar" aria-label="3D view">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={showLabels}
          onChange={(e) => onShowLabels(e.target.checked)}
        />
        Labels
      </label>

      {explode !== null && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={btn}
            aria-pressed={explode > 0.5}
            onClick={() => {
              onExplode(explode > 0.5 ? 0 : 1);
              onExplodeCommit();
            }}
          >
            {explode > 0.5 ? "Assemble" : "Explode"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            aria-label="Exploded view amount"
            className="w-28 accent-accent sm:w-40"
            onChange={(e) => onExplode(Number(e.target.value), true)}
            onPointerUp={onExplodeCommit}
            onKeyUp={onExplodeCommit}
          />
        </div>
      )}

      {onRun && (
        <button
          type="button"
          className={`${btn} ${running ? "border-[#38b2ac] bg-[#38b2ac] hover:bg-[#4fc7c0]" : ""}`}
          style={running ? { color: "#0b0d16" } : undefined}
          aria-pressed={!!running}
          onClick={onRun}
        >
          {running ? "■ Stop" : `▶ ${runLabel ?? "Play"}`}
        </button>
      )}

      {onXray && (
        <button
          type="button"
          className={`${btn} ${xray ? "border-[#38b2ac] bg-[#38b2ac] hover:bg-[#4fc7c0]" : ""}`}
          style={xray ? { color: "#0b0d16" } : undefined}
          aria-pressed={!!xray}
          title="See through the model to its inner parts"
          onClick={() => onXray(!xray)}
        >
          X-ray
        </button>
      )}

      {onTour && (
        <button
          type="button"
          className={`${btn} ${touring ? "border-[#38b2ac] bg-[#38b2ac] hover:bg-[#4fc7c0]" : ""}`}
          style={touring ? { color: "#0b0d16" } : undefined}
          aria-pressed={!!touring}
          title="Fly through every part with its explanation"
          onClick={onTour}
        >
          {touring ? "❚❚ Pause tour" : "▶ Guided tour"}
        </button>
      )}

      {onVoice && (
        <button
          type="button"
          className={`${btn} ${voice ? "border-[#38b2ac] bg-teal-50" : ""}`}
          style={voice ? { color: "#0f766e" } : undefined}
          aria-pressed={!!voice}
          title={
            voiceUnavailable
              ? "Voice narration is not available right now"
              : "Read each part aloud when it is selected or during the guided tour"
          }
          onClick={() => onVoice(!voice)}
        >
          {voiceUnavailable ? "🔇 Voice unavailable" : speaking ? "🔊 Reading…" : voice ? "🔊 Voice on" : "🔇 Voice off"}
        </button>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        Quality
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={quality}
          onChange={(e) => onQuality(e.target.value as QualitySetting)}
        >
          <option value="auto">Auto ({effectiveTier})</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>

      <div className="ml-auto flex gap-2">
        <button type="button" className={btn} onClick={onResetView}>
          Reset view
        </button>
        {vr === "ready" && (
          <button
            type="button"
            className={`${btn} border-[#38b2ac]`}
            style={{ color: "#0b0d16", background: "#38b2ac" }}
            title="View the model at real size in your VR headset"
            onClick={onEnterVr}
          >
            Enter VR
          </button>
        )}
        {(vr === "no-headset" || vr === "needs-https") && (
          <button type="button" className={`${btn} opacity-60`} disabled title={VR_HINT[vr].title}>
            {VR_HINT[vr].label}
          </button>
        )}
        {onFullscreen && (
          <button type="button" className={btn} onClick={onFullscreen}>
            Fullscreen
          </button>
        )}
      </div>
    </div>
  );
}
