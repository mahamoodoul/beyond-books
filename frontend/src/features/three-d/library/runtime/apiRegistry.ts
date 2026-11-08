/**
 * API-backed asset registry for the viewer: shows a 3D-library model (uploaded or AI-generated)
 * with the same SceneViewer as the demo fixtures. The URL is a short-lived signed download URL
 * from the backend; part labels/explanations come from the asset's version metadata.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/api/client";
import type { AssetOut, DownloadUrl, SceneSpec } from "@/api/generated/schema";

import { specFromAsset } from "../../specBuilders";
import type { AssetMetadata, AssetRegistry } from "./types";

export interface LibraryModel {
  asset: AssetOut;
  scene: SceneSpec;
  registry: AssetRegistry;
  explanations: Record<string, string>;
  /** Cached in-depth AI study cards per part (mesh name), from the version metadata. */
  insights: Record<string, unknown>;
}

export function libraryModel(asset: AssetOut, url: string): LibraryModel {
  const base = specFromAsset(asset);
  const scene = {
    ...base,
    scene_id: `library_${asset.slug}`.slice(0, 64),
    title: asset.name,
    // every part gets an explanation slot, so text written later in the Studio shows at once
    components: (base.components ?? []).map((c) => ({ ...c, explanation_ref: c.explanation_ref ?? `exp_${c.component_id}`.slice(0, 64) })),
  };
  const meta: AssetMetadata = {
    asset_id: asset.slug,
    version: asset.latest_version,
    name: asset.name,
    description: asset.description,
    object_key: "",
    components: (scene.components ?? []).map((c) => ({ mesh_name: c.mesh_name, label: c.label })),
    review_status: asset.review_status,
  };
  const registry: AssetRegistry = {
    resolve: (ref) =>
      ref.asset_id === asset.slug && ref.version === asset.latest_version ? { ref, meta, url, previewUrl: asset.preview_url } : null,
  };
  const latest = asset.versions?.find((v) => v.version_number === asset.latest_version);
  const insights = ((latest?.metadata_json as { insights?: Record<string, unknown> } | undefined)?.insights ?? {});
  return { asset, scene, registry, explanations: (scene.explanations ?? {}) as Record<string, string>, insights };
}

/** Loads one library model (asset + signed GLB URL) ready for <SceneViewer>. */
export function useLibraryModel(assetId: string | undefined) {
  const asset = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => api.get<AssetOut>(`/assets/${assetId}`),
    enabled: !!assetId,
  });
  const a = asset.data;
  const url = useQuery({
    queryKey: ["asset-url", a?.id, a?.latest_version],
    queryFn: () => api.get<DownloadUrl>(`/assets/${a?.id}/versions/${a?.latest_version}/download-url`),
    enabled: !!a && a.latest_version > 0,
    staleTime: 5 * 60_000, // signed URLs live ~10 minutes
  });
  // The 3D scene must stay stable (no model reload) when only the cached study cards change, so
  // it depends on the model file identity; the insights are read from the latest asset data.
  const signed = url.data?.url;
  const base = useMemo(
    () => (a && signed ? libraryModel(a, signed) : null),
    [a?.id, a?.latest_version, signed], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const model = useMemo(
    () => (base && a ? { ...base, asset: a, insights: libraryModel(a, signed ?? "").insights } : null),
    [base, a, signed],
  );
  return { model, error: asset.error ?? url.error, isPending: asset.isPending || (!!a && a.latest_version > 0 && url.isPending), empty: !!a && a.latest_version === 0 };
}
