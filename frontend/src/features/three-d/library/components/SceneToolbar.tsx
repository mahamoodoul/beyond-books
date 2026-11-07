export interface SceneToolbarProps {
  showLabels: boolean;
  onShowLabels: (v: boolean) => void;
  explode: number | null;
  onExplode: (v: number) => void;
  onExplodeCommit: () => void;
  onResetView: () => void;
  onFullscreen?: () => void;
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
