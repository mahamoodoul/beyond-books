import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "@/api/client";
import type { DocumentJobResponse, DocumentOut, PageList } from "@/api/generated/schema";
import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { useJob } from "@/features/jobs/useJob";

import { uploadSource } from "@/lib/api";
import { plural } from "@/lib/plural";

const statusTone = { ready: "green", failed: "red", processing: "blue", uploaded: "blue", pending_upload: "slate" } as const;

export function SourcesPanel({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const key = ["documents", courseId];
  const docs = useQuery({ queryKey: key, queryFn: () => api.get<DocumentOut[]>(`/courses/${courseId}/documents`) });
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState({ title: "", text: "" });
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    if (job.data && ["completed", "failed"].includes(job.data.status)) void qc.invalidateQueries({ queryKey: key });
  }, [job.data?.status]);

  const onDone = (r: DocumentJobResponse) => {
    setJobId(r.job.id);
    void qc.invalidateQueries({ queryKey: key });
  };
  const upload = useMutation({ mutationFn: (f: File) => uploadSource(courseId, f), onSuccess: onDone });
  const pasteText = useMutation({
    mutationFn: () => api.post<DocumentJobResponse>("/documents/text", { course_id: courseId, ...paste }),
    onSuccess: (r) => {
      onDone(r);
      setPaste({ title: "", text: "" });
      setPasteOpen(false);
    },
  });
  const submitPaste = (e: FormEvent) => {
    e.preventDefault();
    pasteText.mutate();
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Source materials</h2>
        <div className="flex gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700">
            {upload.isPending ? "Uploading…" : "Upload PDF / text file"}
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              disabled={upload.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
          </label>
          <Button variant="secondary" onClick={() => setPasteOpen((v) => !v)}>Paste text</Button>
        </div>
      </div>
      <ErrorAlert error={upload.error ?? pasteText.error} />
      {job.data && !["completed"].includes(job.data.status) && (
        <p className="mb-3 text-sm text-slate-600" role="status">
          Extraction: <Badge tone={job.data.status === "failed" ? "red" : "blue"}>{job.data.status}</Badge>{" "}
          {job.data.error_message}
        </p>
      )}
      {pasteOpen && (
        <form onSubmit={submitPaste} className="mb-4 space-y-3 rounded-md bg-slate-50 p-3">
          <Field label="Title"><Input required value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} /></Field>
          <Field label="Text"><Textarea required rows={8} value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} /></Field>
          <Button type="submit" disabled={pasteText.isPending}>Add reference</Button>
        </form>
      )}
      {docs.isPending && <Loading />}
      <ErrorAlert error={docs.error} />
      {docs.data?.length === 0 && <EmptyState title="No sources yet">Upload a textbook chapter to get started.</EmptyState>}
      <ul className="divide-y divide-slate-100">
        {docs.data?.map((d) => (
          <li key={d.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-slate-500">
                  {d.page_count ? `${d.page_count} pages` : d.mime_type}
                  {d.pages_needing_ocr > 0 && ` · ${plural(d.pages_needing_ocr, "page")} ${d.pages_needing_ocr === 1 ? "needs" : "need"} OCR`}
                </p>
                {d.error_message && <p className="text-sm text-red-700">{d.error_message}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone[d.processing_status]}>{d.processing_status}</Badge>
                {d.processing_status === "ready" && (
                  <Button variant="ghost" onClick={() => setViewing(viewing === d.id ? null : d.id)}>
                    {viewing === d.id ? "Hide text" : "Review text"}
                  </Button>
                )}
              </div>
            </div>
            {viewing === d.id && <PageViewer docId={d.id} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PageViewer({ docId }: { docId: string }) {
  const [offset, setOffset] = useState(0);
  const pages = useQuery({
    queryKey: ["pages", docId, offset],
    queryFn: () => api.get<PageList>(`/documents/${docId}/pages?offset=${offset}&limit=5`),
  });
  if (pages.isPending) return <Loading />;
  if (pages.error) return <ErrorAlert error={pages.error instanceof ApiError ? pages.error : null} />;
  return (
    <div className="mt-3 space-y-3">
      {pages.data.items.map((p) => (
        <div key={p.page_number} className="rounded-md bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">
            Page {p.page_number} {p.quality_status !== "ok" && <Badge tone="amber">{p.quality_status}</Badge>}
          </p>
          <p className="whitespace-pre-wrap text-sm">{p.extracted_text || "(no text)"}</p>
        </div>
      ))}
      <div className="flex items-center gap-2 text-sm">
        <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 5))}>Previous</Button>
        <span>
          {offset + 1}–{Math.min(offset + 5, pages.data.total)} of {pages.data.total}
        </span>
        <Button variant="secondary" disabled={offset + 5 >= pages.data.total} onClick={() => setOffset(offset + 5)}>Next</Button>
      </div>
    </div>
  );
}
