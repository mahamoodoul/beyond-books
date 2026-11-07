/**
 * 3D classroom viewer (design §11.4). Lazy-loaded so three.js is never downloaded on pages
 * without 3D. Provides a text alternative (component list + explanations) for accessibility.
 */
import { useQuery } from "@tanstack/react-query";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { api } from "@/api/client";
import type { ResolvedScene, SceneComponent } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button } from "@/components/ui";

import { SceneCanvas } from "./SceneCanvas";

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-200">
        The 3D view could not be displayed on this device. Use the parts list and explanations instead.
      </div>
    ) : (
      this.props.children
    );
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq?.addEventListener("change", on);
    return () => mq?.removeEventListener("change", on);
  }, []);
  return reduced;
}

export default function SceneViewer({ sceneId, height = 520 }: { sceneId: string; height?: number }) {
  const resolved = useQuery({
    queryKey: ["scene-resolved", sceneId],
    queryFn: () => api.get<ResolvedScene>(`/scenes/${sceneId}/resolved`),
    staleTime: 5 * 60_000, // signed URLs last 10 minutes
  });
  const [selected, setSelected] = useState<SceneComponent | null>(null);
  const [loadedNames, setLoadedNames] = useState<Set<string>>(new Set());
  const reducedMotion = usePrefersReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const onMeshesLoaded = useCallback(
    (names: string[]) => setLoadedNames((prev) => new Set([...prev, ...names])),
    [],
  );

  const spec = resolved.data?.spec;
  const components = spec?.components ?? [];
  const missing = useMemo(() => {
    if (!resolved.data?.assets.length || loadedNames.size === 0) return [];
    const procedural = new Set((spec?.procedural ?? []).length ? components.map((c) => c.mesh_name) : []);
    return components.filter((c) => !loadedNames.has(c.mesh_name) && !procedural.has(c.mesh_name));
  }, [loadedNames, components, resolved.data, spec]);

  if (resolved.isPending) return <Loading label="Preparing 3D scene…" />;
  if (resolved.error) return <ErrorAlert error={resolved.error} />;
  const data = resolved.data;
  const explanation = selected?.explanation_ref ? data.spec.explanations?.[selected.explanation_ref] : undefined;

  return (
    <div ref={box} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col lg:flex-row">
        <div className="relative flex-1 bg-navy-950" style={{ height }}>
          <WebGLBoundary>
            <SceneCanvas
              spec={data.spec}
              assets={data.assets}
              selected={selected}
              onSelect={setSelected}
              onMeshesLoaded={onMeshesLoaded}
              reducedMotion={reducedMotion}
            />
          </WebGLBoundary>
          <Button
            variant="secondary"
            className="absolute right-3 top-3"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())}
          >
            Fullscreen
          </Button>
        </div>
        <aside className="w-full space-y-4 p-4 lg:w-80" aria-label="Scene parts and explanations">
          <div>
            <h3 className="font-semibold">{data.spec.title}</h3>
            <p className="text-xs text-slate-500">Drag to rotate · scroll to zoom · click a part to learn about it</p>
          </div>
          <div aria-live="polite" className="min-h-20 rounded-md bg-slate-50 p-3">
            {selected ? (
              <>
                <p className="font-medium">{selected.label}</p>
                <p className="mt-1 text-sm text-slate-700">{explanation ?? "No explanation has been written for this part yet."}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Select a part in the model or from the list.</p>
            )}
          </div>
          {components.length > 0 && (
            <ul className="space-y-1" aria-label="Parts">
              {components.map((c) => (
                <li key={c.component_id}>
                  <button
                    className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${selected?.component_id === c.component_id ? "bg-navy-900 text-white" : "hover:bg-slate-100"}`}
                    aria-pressed={selected?.component_id === c.component_id}
                    onClick={() => setSelected(selected?.component_id === c.component_id ? null : c)}
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(missing.length > 0 || data.warnings.length > 0) && (
            <div className="space-y-1">
              {missing.map((c) => <Badge key={c.component_id} tone="amber">“{c.label}” not found in model</Badge>)}
              {data.warnings.map((w) => <Badge key={w} tone="amber">{w}</Badge>)}
            </div>
          )}
          {data.assets.map((a) => (
            <p key={a.asset_id} className="text-xs text-slate-500">
              Model: {a.name} · {a.license_name}
              {a.attribution_text && ` · ${a.attribution_text}`}
              {a.source_url && (
                <>
                  {" · "}
                  <a href={a.source_url} target="_blank" rel="noreferrer noopener" className="underline">source</a>
                </>
              )}
            </p>
          ))}
        </aside>
      </div>
    </div>
  );
}
