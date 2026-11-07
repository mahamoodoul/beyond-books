import { useState } from "react";
import { Link } from "react-router";

import { ApiError } from "@/api/client";
import type { SceneOut, SceneSpec } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Textarea } from "@/components/ui";

import { useAsset, useAssets, useGenerators, useSceneMutations, useScenes } from "./api";
import { AnimationsPanel } from "./AnimationsPanel";
import { LazySceneViewer } from "./LazySceneViewer";
import { PlanSceneButton } from "./PlanSceneButton";
import { specFromAsset, specFromGenerator } from "./specBuilders";

function errorDetails(err: unknown): string[] {
  if (err instanceof ApiError) return err.details.map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d));
  return [];
}

function NewScene({ lessonId, onCreated }: { lessonId: string; onCreated: () => void }) {
  const assets = useAssets();
  const gens = useGenerators();
  const m = useSceneMutations(lessonId);
  const [assetId, setAssetId] = useState<string | null>(null);
  const asset = useAsset(assetId);
  const approved = (assets.data ?? []).filter((a) => a.review_status === "approved" && a.latest_version > 0);

  const create = (spec: SceneSpec) => m.create.mutate(spec, { onSuccess: onCreated });
  return (
    <div className="space-y-3 rounded-md bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From an approved model">
          <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={assetId ?? ""} onChange={(e) => setAssetId(e.target.value || null)}>
            <option value="">Choose a model…</option>
            {approved.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <div className="flex items-end">
          <Button disabled={!asset.data || m.create.isPending} onClick={() => asset.data && create(specFromAsset(asset.data))}>Create from model</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Or a procedural scene:</span>
        {gens.data?.map((g) => (
          <Button key={g.name} variant="secondary" title={g.description} disabled={m.create.isPending} onClick={() => create(specFromGenerator(g))}>
            {g.name.replace("_", " ")}
          </Button>
        ))}
      </div>
      <ErrorAlert error={m.create.error} />
      {errorDetails(m.create.error).map((d) => <p key={d} className="text-sm text-red-700">• {d}</p>)}
    </div>
  );
}

function SceneRow({ scene, lessonId }: { scene: SceneOut; lessonId: string }) {
  const m = useSceneMutations(lessonId);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [json, setJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const startEdit = () => {
    setJson(JSON.stringify(scene.spec, null, 2));
    setParseError(null);
    setEditing(true);
  };
  const save = () => {
    let spec: SceneSpec;
    try {
      spec = JSON.parse(json) as SceneSpec;
    } catch (e) {
      setParseError((e as Error).message);
      return;
    }
    setParseError(null);
    m.update.mutate({ id: scene.id, expected_version: scene.version, spec }, { onSuccess: () => setEditing(false) });
  };
  const live = !!scene.published_version;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{scene.title}</span>
          <Badge>v{scene.version}</Badge>
          {scene.origin === "ai" && <Badge tone="blue">AI-planned</Badge>}
          <Badge tone={live ? (scene.has_unpublished_changes ? "amber" : "green") : "slate"}>
            {live ? (scene.has_unpublished_changes ? `live: v${scene.published_version}` : "published") : "draft"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" onClick={() => setPreview((v) => !v)}>{preview ? "Hide preview" : "Preview"}</Button>
          <Button variant="ghost" onClick={() => (editing ? setEditing(false) : startEdit())}>{editing ? "Close editor" : "Edit spec"}</Button>
          <Button variant="secondary" disabled={live && !scene.has_unpublished_changes} onClick={() => m.publish.mutate(scene.id)}>Publish v{scene.version}</Button>
          {live && <Button variant="ghost" onClick={() => m.unpublish.mutate(scene.id)}>Unpublish</Button>}
          <Button variant="ghost" aria-label="Delete scene" onClick={() => confirm("Delete this scene?") && m.remove.mutate(scene.id)}>✕</Button>
        </div>
      </div>
      {scene.planning_rationale && <p className="text-xs text-slate-500">AI rationale: {scene.planning_rationale}</p>}
      {(scene.warnings ?? []).map((w) => <Badge key={w} tone="amber">{w}</Badge>)}
      <ErrorAlert error={m.publish.error ?? m.update.error} />
      {[...errorDetails(m.update.error), ...errorDetails(m.publish.error)].map((d) => <p key={d} className="text-sm text-red-700">• {d}</p>)}
      {editing && (
        <div className="mt-3 space-y-2">
          <Field label="Scene specification (JSON)" hint="Edit labels and add explanations; components must match parts in the model.">
            <Textarea rows={18} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} />
          </Field>
          {parseError && <p className="text-sm text-red-700">Invalid JSON: {parseError}</p>}
          <Button disabled={m.update.isPending} onClick={save}>Save scene</Button>
        </div>
      )}
      <AnimationsPanel sceneId={scene.id} lessonId={lessonId} firstComponent={scene.spec.components?.[0]?.component_id} />
      {preview && <div className="mt-3"><LazySceneViewer key={`${scene.id}-${scene.version}`} sceneId={scene.id} height={420} /></div>}
    </li>
  );
}

export function ScenesCard({ lessonId }: { lessonId: string }) {
  const scenes = useScenes(lessonId);
  const [adding, setAdding] = useState(false);
  return (
    <Card className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">3D scenes</h2>
        <div className="flex gap-2">
          <Link to={`/teacher/lessons/${lessonId}/studio`} className="rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700">Open 3D Studio</Link>
          <Button variant="secondary" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add 3D scene"}</Button>
        </div>
      </div>
      <div className="mb-3"><PlanSceneButton lessonId={lessonId} /></div>
      {adding && <NewScene lessonId={lessonId} onCreated={() => setAdding(false)} />}
      {scenes.isPending && <Loading />}
      <ErrorAlert error={scenes.error} />
      {scenes.data?.length === 0 && !adding && <EmptyState title="No 3D scene yet">Add a scene from an approved model or a procedural generator.</EmptyState>}
      <ul className="divide-y divide-slate-100">
        {scenes.data?.map((s) => <SceneRow key={s.id} scene={s} lessonId={lessonId} />)}
      </ul>
    </Card>
  );
}
