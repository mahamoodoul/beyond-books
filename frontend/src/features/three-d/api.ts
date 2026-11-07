import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { AssetOut, AssetUploadResponse, GeneratorOut, SceneOut, SceneSpec } from "@/api/generated/schema";

export const useAssets = () => useQuery({ queryKey: ["assets"], queryFn: () => api.get<AssetOut[]>("/assets") });
export const useAsset = (id: string | null) =>
  useQuery({ queryKey: ["asset", id], queryFn: () => api.get<AssetOut>(`/assets/${id}`), enabled: !!id });
export const useGenerators = () =>
  useQuery({ queryKey: ["generators"], queryFn: () => api.get<GeneratorOut[]>("/three-d/generators"), staleTime: Infinity });
export const useScenes = (lessonId: string) =>
  useQuery({ queryKey: ["scenes", lessonId], queryFn: () => api.get<SceneOut[]>(`/lessons/${lessonId}/scenes`) });

export async function uploadAssetFile(assetId: string, file: File): Promise<AssetOut> {
  const up = await api.post<AssetUploadResponse>(`/assets/${assetId}/versions/upload-url`, { size_bytes: file.size });
  const sameOrigin = up.url.startsWith("/");
  const res = await fetch(up.url, {
    method: up.method,
    body: file,
    headers: { ...up.headers, ...(sameOrigin ? { "X-Requested-With": "edu3d" } : {}) },
    credentials: sameOrigin ? "include" : "omit",
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
  return api.post<AssetOut>(`/assets/${assetId}/versions/${up.version_number}/complete`);
}

export function useSceneMutations(lessonId: string) {
  const qc = useQueryClient();
  const refresh = (s?: SceneOut) => {
    void qc.invalidateQueries({ queryKey: ["scenes", lessonId] });
    if (s) void qc.invalidateQueries({ queryKey: ["scene-resolved", s.id] });
  };
  return {
    create: useMutation({ mutationFn: (spec: SceneSpec) => api.post<SceneOut>(`/lessons/${lessonId}/scenes`, { spec }), onSuccess: refresh }),
    update: useMutation({
      mutationFn: (b: { id: string; expected_version: number; spec: SceneSpec }) =>
        api.patch<SceneOut>(`/scenes/${b.id}`, { expected_version: b.expected_version, spec: b.spec }),
      onSuccess: refresh,
    }),
    publish: useMutation({ mutationFn: (id: string) => api.post<SceneOut>(`/scenes/${id}/publish`), onSuccess: refresh }),
    unpublish: useMutation({ mutationFn: (id: string) => api.post<SceneOut>(`/scenes/${id}/unpublish`), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.delete<void>(`/scenes/${id}`), onSuccess: () => refresh() }),
  };
}
