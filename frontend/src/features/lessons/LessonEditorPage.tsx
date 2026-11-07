import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import type { LessonContent, LessonSection } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";
import { RegenerateSection } from "@/features/ai/RegenerateSection";
import { ScenesCard } from "@/features/three-d/ScenesCard";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

import { useLesson, useLessonMutations } from "./api";

const emptySection = (): LessonSection => ({ title: "New section", body_markdown: "", key_terms: [], source_refs: [] });

export function LessonEditorPage() {
  const { lessonId = "" } = useParams();
  const lesson = useLesson(lessonId);
  const m = useLessonMutations(lessonId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<LessonContent | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (lesson.data) {
      setTitle(lesson.data.title);
      setContent(lesson.data.content);
      setDirty(false);
    }
  }, [lesson.data]);

  if (lesson.error) return <ErrorAlert error={lesson.error} />;
  if (lesson.isPending || !content) return <Loading />;
  const l = lesson.data;
  const sections = content.sections ?? [];

  const edit = (next: LessonContent) => {
    setContent(next);
    setDirty(true);
  };
  const setSection = (i: number, patch: Partial<LessonSection>) =>
    edit({ ...content, sections: sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...sections];
    const [s] = next.splice(i, 1);
    if (s) next.splice(i + d, 0, s);
    edit({ ...content, sections: next });
  };
  const save = () => m.save.mutate({ expected_version: l.version, title, content });

  return (
    <>
      <Link to={`/teacher/chapters/${l.chapter_id}`} className="text-sm text-accent hover:underline">← Back to chapter</Link>
      <PageHeader title={l.title}>
        {l.origin === "ai" && <Badge tone="blue">AI-generated — review before publishing</Badge>}
        <Badge>v{l.version}</Badge>
        {l.published_version ? (
          <Badge tone={l.has_unpublished_changes ? "amber" : "green"}>
            {l.has_unpublished_changes ? `live: v${l.published_version}` : "published"}
          </Badge>
        ) : (
          <Badge>draft</Badge>
        )}
      </PageHeader>
      <ErrorAlert error={m.save.error ?? m.publish.error ?? m.unpublish.error} />
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap gap-2 bg-surface py-2">
        <Button disabled={!dirty || m.save.isPending} onClick={save}>{m.save.isPending ? "Saving…" : dirty ? "Save draft" : "Saved"}</Button>
        <Button variant="secondary" disabled={dirty || m.publish.isPending || (!!l.published_version && !l.has_unpublished_changes)} onClick={() => m.publish.mutate()}>
          Approve & publish v{l.version}
        </Button>
        {l.published_version && <Button variant="ghost" onClick={() => m.unpublish.mutate()}>Unpublish</Button>}
      </div>

      <Card className="mb-4">
        <Field label="Lesson title"><Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></Field>
      </Card>

      <div className="space-y-4">
        {sections.map((s, i) => (
          <Card key={i}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input aria-label={`Section ${i + 1} title`} value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} />
              <Button variant="ghost" aria-label="Move section up" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button variant="ghost" aria-label="Move section down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button variant="ghost" aria-label="Remove section" onClick={() => edit({ ...content, sections: sections.filter((_, j) => j !== i) })}>✕</Button>
              <RegenerateSection lessonId={l.id} index={i} version={l.version} disabled={dirty} onDone={() => void lesson.refetch()} />
            </div>
            <Textarea aria-label={`Section ${i + 1} body`} rows={8} value={s.body_markdown} onChange={(e) => setSection(i, { body_markdown: e.target.value })} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Key terms" hint="Comma-separated.">
                <Input value={(s.key_terms ?? []).join(", ")} onChange={(e) => setSection(i, { key_terms: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
              </Field>
              <div>
                <p className="text-sm font-medium text-slate-700">Sources</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(s.source_refs ?? []).length === 0 ? (
                    <Badge tone="amber">no source reference</Badge>
                  ) : (
                    (s.source_refs ?? []).map((r, k) => <Badge key={k}>p. {r.page}</Badge>)
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
        <Button variant="secondary" onClick={() => edit({ ...content, sections: [...sections, emptySection()] })}>Add section</Button>
      </div>

      <Card className="mt-6">
        <Field label="Summary" hint="One point per line.">
          <Textarea rows={4} value={(content.summary ?? []).join("\n")} onChange={(e) => edit({ ...content, summary: e.target.value.split("\n").filter((x) => x.trim()) })} />
        </Field>
        {(content.visualization_candidates ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">3D visualization candidates</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
              {content.visualization_candidates?.map((v, i) => (
                <li key={i}><strong>{v.concept}</strong> ({v.visualization_type}) — {v.learning_reason}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <ScenesCard lessonId={l.id} />
    </>
  );
}
