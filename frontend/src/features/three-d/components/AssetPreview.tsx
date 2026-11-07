import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { api } from "@/api/client";
import type { AssetOut, DownloadUrl, SceneComponent } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";

import { specFromAsset } from "../specBuilders";
import { SceneCanvas } from "./SceneCanvas";

/** Teacher review preview: renders the latest version with every named part selectable. */
export default function AssetPreview({ asset }: { asset: AssetOut }) {
  const url = useQuery({
    queryKey: ["asset-url", asset.id, asset.latest_version],
    queryFn: () => api.get<DownloadUrl>(`/assets/${asset.id}/versions/${asset.latest_version}/download-url`),
    staleTime: 5 * 60_000,
  });
  const [selected, setSelected] = useState<SceneComponent | null>(null);
  const noop = useCallback(() => {}, []);
  if (url.isPending) return <Loading />;
  if (url.error) return <ErrorAlert error={url.error} />;
  const spec = specFromAsset(asset);
  return (
    <div>
      <div className="h-80 overflow-hidden rounded-md bg-navy-950">
        <SceneCanvas
          spec={spec}
          assets={[{ asset_id: asset.slug, version: asset.latest_version, url: url.data.url, node_names: [], name: asset.name, license_name: asset.license_name, attribution_text: asset.attribution_text, source_url: asset.source_url }]}
          selected={selected}
          onSelect={setSelected}
          onMeshesLoaded={noop}
          reducedMotion
        />
      </div>
      <p className="mt-1 text-sm text-slate-600">{selected ? `Selected part: ${selected.mesh_name}` : "Click a part to see its name."}</p>
    </div>
  );
}
