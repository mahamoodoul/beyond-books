import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type FormEvent } from "react";

import { api } from "@/api/client";
import type { AssetOut } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";

import { uploadAssetFile, useAsset, useAssets } from "./api";
import { GenerateSuggested } from "./PlanSceneButton";

const AssetPreview = lazy(() => import("./components/AssetPreview"));
const reviewTone = { approved: "green", pending: "amber", rejected: "red" } as const;

function UploadForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", license_name: "", attribution_text: "", source_url: "", subject: "" });
  const [file, setFile] = useState<File | null>(null);
  const qc = useQueryClient();
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a .glb file.");
      const asset = await api.post<AssetOut>("/assets", {
        ...form,
        source_url: form.source_url || null,
        subject: form.subject || null,
      });
      return uploadAssetFile(asset.id, file);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    upload.mutate();
  };
  return (
    <form onSubmit={submit} className="mb-4 grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
      <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Subject"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Biology" /></Field>
      <Field label="License" hint="e.g. CC-BY-4.0, CC0-1.0, or your own work."><Input required value={form.license_name} onChange={(e) => setForm({ ...form, license_name: e.target.value })} /></Field>
      <Field label="Source URL (optional)"><Input type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></Field>
      <Field label="Attribution"><Input value={form.attribution_text} onChange={(e) => setForm({ ...form, attribution_text: e.target.value })} placeholder="Author name, title" /></Field>
      <Field label="Model file (.glb)" hint="Binary glTF 2.0, everything embedded, max 30 MB.">
        <input type="file" accept=".glb,model/gltf-binary" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={upload.isPending}>{upload.isPending ? "Uploading & validating…" : "Upload model"}</Button>
        <ErrorAlert error={upload.error} />
      </div>
    </form>
  );
}

function GenerateForm() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const results = useQuery({
    queryKey: ["asset-search", submitted],
    queryFn: () => api.get<AssetOut[]>(`/assets/search?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.length > 2,
  });
  return (
    <div className="mb-4 space-y-3 rounded-md bg-slate-50 p-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(q); }}>
        <Input aria-label="Describe the model you need" placeholder="Describe the model you need, e.g. plant cell" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">Search library first</Button>
      </form>
      {results.data && results.data.length > 0 && (
        <p className="text-sm">Already in the library: {results.data.map((a) => a.name).join(", ")} — consider reusing these.</p>
      )}
      {results.data && <GenerateSuggested key={submitted} prompt={`A clear, simple educational 3D model of ${submitted}`} name={submitted} />}
    </div>
  );
}

function AssetDetail({ id }: { id: string }) {
  const asset = useAsset(id);
  const qc = useQueryClient();
  const review = useMutation({
    mutationFn: (decision: "approved" | "rejected") => api.post<AssetOut>(`/assets/${id}/review`, { decision }),
    onSuccess: (a) => {
      qc.setQueryData(["asset", id], a);
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
  if (asset.isPending) return <Loading />;
  if (asset.error) return <ErrorAlert error={asset.error} />;
  const a = asset.data;
  const latest = a.versions?.find((v) => v.version_number === a.latest_version);
  const meta = (latest?.metadata_json ?? {}) as { node_names?: string[]; triangle_count?: number; mesh_count?: number };
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      {a.latest_version > 0 ? (
        <Suspense fallback={<Loading label="Loading 3D preview…" />}><AssetPreview asset={a} /></Suspense>
      ) : (
        <EmptyState title="No valid model version uploaded" />
      )}
      <div className="space-y-2 text-sm">
        <p>{a.description}</p>
        <p><strong>License:</strong> {a.license_name} {a.attribution_text && `· ${a.attribution_text}`}</p>
        {latest && (
          <p><strong>v{latest.version_number}:</strong> {meta.mesh_count} meshes, {meta.triangle_count?.toLocaleString()} triangles, {(latest.file_size_bytes / 1024).toFixed(0)} KB</p>
        )}
        {meta.node_names && <p><strong>Selectable parts:</strong> {meta.node_names.join(", ")}</p>}
        {a.can_manage && a.latest_version > 0 && (
          <div className="flex gap-2 pt-2">
            <Button disabled={review.isPending || a.review_status === "approved"} onClick={() => review.mutate("approved")}>Approve for use</Button>
            <Button variant="danger" disabled={review.isPending || a.review_status === "rejected"} onClick={() => review.mutate("rejected")}>Reject</Button>
          </div>
        )}
        <ErrorAlert error={review.error} />
      </div>
    </div>
  );
}

export function AssetsPage() {
  const assets = useAssets();
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="3D model library">
        <Button variant="secondary" onClick={() => setGenerating((v) => !v)}>{generating ? "Cancel" : "✦ Generate with AI"}</Button>
        <Button onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Upload model"}</Button>
      </PageHeader>
      <Card>
        {generating && <GenerateForm />}
        {adding && <UploadForm onDone={() => setAdding(false)} />}
        {assets.isPending && <Loading />}
        <ErrorAlert error={assets.error} />
        {assets.data?.length === 0 && <EmptyState title="No models yet">Upload a licensed .glb model to use in lesson scenes.</EmptyState>}
        <ul className="divide-y divide-slate-100">
          {assets.data?.map((a) => (
            <li key={a.id} className="py-3">
              <button className="flex w-full items-center justify-between text-left" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                <span>
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{a.visibility} · {a.license_name}</span>
                </span>
                <Badge tone={reviewTone[a.review_status as keyof typeof reviewTone] ?? "slate"}>{a.review_status}</Badge>
              </button>
              {open === a.id && <AssetDetail id={a.id} />}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
