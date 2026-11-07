import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { EmptyState, ErrorAlert, Loading } from "@/components/feedback";
import { Badge, Button, Card, Input } from "@/components/ui";

import { useChapterMutations, useChapters } from "./api";

export function ChaptersPanel({ courseId }: { courseId: string }) {
  const chapters = useChapters(courseId);
  const m = useChapterMutations(courseId);
  const [title, setTitle] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.create.mutate({ title }, { onSuccess: () => setTitle("") });
  };
  const list = chapters.data ?? [];

  return (
    <Card>
      <h2 className="font-semibold">Chapters</h2>
      <p className="mb-3 text-sm text-slate-600">Open a chapter's Studio to generate its lesson, quiz and 3D content from the chapter text, preview it, and publish it to students.</p>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <Input required placeholder="New chapter title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New chapter title" />
        <Button type="submit" disabled={m.create.isPending}>Add</Button>
      </form>
      <ErrorAlert error={chapters.error ?? m.create.error ?? m.update.error ?? m.remove.error} />
      {chapters.isPending && <Loading />}
      {chapters.data?.length === 0 && (
        <EmptyState title="No chapters yet">Add chapters manually or generate an outline from your sources.</EmptyState>
      )}
      <ol className="divide-y divide-slate-100">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <span className="w-6 text-right text-sm text-slate-500">{c.position}.</span>
            <Link to={`/teacher/chapters/${c.id}`} className="flex-1 font-medium hover:underline">{c.title}</Link>
            <Badge tone={c.status === "published" ? "green" : "slate"}>{c.status}</Badge>
            <Link to={`/teacher/chapters/${c.id}/preview`} className="rounded-md px-2 py-1 text-sm text-accent hover:underline">Preview</Link>
            <Link to={`/teacher/chapters/${c.id}/studio`} className="rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700">Open Studio</Link>
            <Button variant="ghost" aria-label={`Move ${c.title} up`} disabled={i === 0} onClick={() => m.update.mutate({ id: c.id, position: c.position - 1 })}>↑</Button>
            <Button variant="ghost" aria-label={`Move ${c.title} down`} disabled={i === list.length - 1} onClick={() => m.update.mutate({ id: c.id, position: c.position + 1 })}>↓</Button>
            <Button
              variant="ghost"
              aria-label={`Delete ${c.title}`}
              onClick={() => confirm(`Delete chapter "${c.title}" and its lessons?`) && m.remove.mutate(c.id)}
            >
              ✕
            </Button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
