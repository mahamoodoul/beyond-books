import type { QualitySetting, QualityTier } from "@/features/three-d/library/runtime/quality";

export interface SceneToolbarProps {
  quality: QualitySetting;
  effectiveTier: QualityTier;
  onQuality: (q: QualitySetting) => void;
  showLabels: boolean;
  onShowLabels: (v: boolean) => void;
  explode: number | null;
  onExplode: (v: number) => void;
  onExplodeCommit: () => void;
  onResetView: () => void;
  onFullscreen?: () => void;
  /** Studio tools (optional): X-ray and a guided tour through the parts. */
  xray?: boolean;
  onXray?: (v: boolean) => void;
  touring?: boolean;
  onTour?: () => void;
}

const btn =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent";

export function SceneToolbar({
  showLabels,
  onShowLabels,
  explode,
  onExplode,
  onExplodeCommit,
  onResetView,
  onFullscreen,
  quality,
  effectiveTier,
  onQuality,
  xray,
  onXray,
  touring,
  onTour,
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
            onChange={(e) => onExplode(Number(e.target.value))}
            onPointerUp={onExplodeCommit}
            onKeyUp={onExplodeCommit}
          />
        </div>
      )}

      {onXray && (
        <button
          type="button"
          className={`${btn} ${xray ? "border-navy-900 bg-navy-900 text-white hover:bg-navy-700" : ""}`}
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
          className={`${btn} ${touring ? "border-navy-900 bg-navy-900 text-white hover:bg-navy-700" : ""}`}
          aria-pressed={!!touring}
          title="Fly through every part with its explanation"
          onClick={onTour}
        >
          {touring ? "❚❚ Pause tour" : "▶ Guided tour"}
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
        {onFullscreen && (
          <button type="button" className={btn} onClick={onFullscreen}>
            Fullscreen
          </button>
        )}
      </div>
    </div>
  );
}
