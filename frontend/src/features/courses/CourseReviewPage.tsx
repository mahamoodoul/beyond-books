import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { getCourse, publishCourse, updateCourse } from "@/lib/api";
import type { Chapter, ChapterStatus, Course, Question } from "@/lib/types";

const CardiacViewer = lazy(() =>
  import("@/features/lessons/CardiacViewer").then((module) => ({ default: module.CardiacViewer })),
);

type ReviewTab = "Lesson" | "3D Visual" | "Assessment";

function getRequiredChapter(course: Course, chapterId: string): Chapter {
  const chapter = course.chapters.find((item) => item.id === chapterId) ?? course.chapters[0];
  if (!chapter) throw new Error("Choose a chapter to continue reviewing this course.");
  return chapter;
}

function AIGeneratedBlock({
  title,
  onRegenerate,
  children,
}: {
  title: string;
  onRegenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="editor-block">
      <div className="editor-block-heading"><h3>{title}</h3><span className="ai-generated-badge"><Icon name="sparkles" size={12} /> AI generated</span><button className="regenerate-button" onClick={onRegenerate} type="button"><Icon name="rotate" size={13} /> Regenerate</button></div>
      {children}
    </section>
  );
}

export function CourseReviewPage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const courseQuery = useQuery({ queryKey: ["course", courseId], queryFn: () => getCourse(courseId) });
  const [draft, setDraft] = useState<Course | null>(null);
  const [activeChapterId, setActiveChapterId] = useState("");
  const [activeTab, setActiveTab] = useState<ReviewTab>("Lesson");
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!courseQuery.data) return;
    setDraft((current) => {
      if (current?.id === courseQuery.data.id) return current;
      setActiveChapterId(courseQuery.data.chapters[0]?.id ?? "");
      return courseQuery.data;
    });
  }, [courseQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (updatedCourse: Course) => updateCourse(updatedCourse),
    onSuccess(savedCourse) {
      setDraft(savedCourse);
      queryClient.setQueryData(["course", courseId], savedCourse);
      setNotice("Your edits have been saved.");
      setErrorMessage("");
    },
    onError(error) {
      setErrorMessage(error instanceof Error ? error.message : "The course could not be saved.");
    },
  });
  const publishMutation = useMutation({
    mutationFn: (id: string) => publishCourse(id),
    onSuccess(publishedCourse) {
      setDraft(publishedCourse);
      queryClient.setQueryData(["course", courseId], publishedCourse);
      setNotice("Your course is published and ready to share.");
    },
    onError(error) {
      setErrorMessage(error instanceof Error ? error.message : "The course could not be published.");
    },
  });

  if (courseQuery.isError) throw courseQuery.error;
  const courseDraft = draft;
  if (courseQuery.isPending || courseDraft === null) return <p className="page-loading" role="status">Preparing your course review…</p>;

  const currentDraft: Course = courseDraft;
  const chapter = getRequiredChapter(currentDraft, activeChapterId);
  const canPublish = currentDraft.chapters.length > 0 && currentDraft.chapters.every((item) => item.status === "Approved");
  const tabs: ReviewTab[] = ["Lesson", "3D Visual", "Assessment"];

  function updateChapter(chapterId: string, edit: (current: Chapter) => Chapter) {
    setDraft((current) => current && ({
      ...current,
      chapters: current.chapters.map((item) => item.id === chapterId ? edit(item) : item),
    }));
    setNotice("");
  }

  function updateActiveLesson(update: (lesson: Chapter["lesson"]) => Chapter["lesson"]) {
    updateChapter(chapter.id, (current) => ({ ...current, lesson: update(current.lesson) }));
  }

  function regenerate(block: string) {
    setNotice(`Refreshing “${block}” with the course source…`);
    window.setTimeout(() => setNotice(`A refreshed draft for “${block}” is ready for your review.`), 650);
  }

  function setChapterStatus(status: ChapterStatus) {
    updateChapter(chapter.id, (current) => ({ ...current, status }));
  }

  function reorderChapter(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= currentDraft.chapters.length) return;
    const chapters = [...currentDraft.chapters];
    const [moving] = chapters.splice(index, 1);
    if (!moving) return;
    chapters.splice(target, 0, moving);
    setDraft({ ...currentDraft, chapters });
  }

  function addChapter() {
    const chapterNumber = currentDraft.chapters.length + 1;
    const newChapter: Chapter = {
      id: `chapter-${Date.now()}`,
      title: `New chapter ${chapterNumber}`,
      status: "Draft",
      lesson: {
        id: `lesson-${Date.now()}`,
        title: "A new lesson",
        objectives: ["Add a learning objective"],
        explanation: "Add an explanation for this chapter.",
        keyTerms: [],
        examples: [],
        summary: "Add a short summary.",
      },
      model: { url: null, alt: "An editable 3D learning visual.", description: "Add a model description.", hotspots: [], animationSteps: [] },
      questions: [],
    };
    setDraft({ ...currentDraft, chapters: [...currentDraft.chapters, newChapter] });
    setActiveChapterId(newChapter.id);
    setActiveTab("Lesson");
  }

  function deleteChapter(chapterId: string) {
    if (currentDraft.chapters.length <= 1) {
      setErrorMessage("A course needs at least one chapter.");
      return;
    }
    const chapters = currentDraft.chapters.filter((item) => item.id !== chapterId);
    setDraft({ ...currentDraft, chapters });
    if (activeChapterId === chapterId) setActiveChapterId(chapters[0]?.id ?? "");
  }

  function updateQuestion(questionId: string, edit: (question: Question) => Question) {
    updateChapter(chapter.id, (current) => ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId ? edit(question) : question),
    }));
  }

  async function saveAndPublish() {
    if (!canPublish) return;
    setErrorMessage("");
    try {
      const savedCourse = await saveMutation.mutateAsync(currentDraft);
      await publishMutation.mutateAsync(savedCourse.id);
      navigate("/teacher");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The course could not be published.");
    }
  }

  function renderLessonEditor() {
    return (
      <div className="editor-content">
        <AIGeneratedBlock onRegenerate={() => regenerate("learning objectives")} title="Learning objectives">
          <textarea aria-label="Learning objectives, one per line" className="editor-textarea editor-objectives" onChange={(event) => updateActiveLesson((lesson) => ({ ...lesson, objectives: event.target.value.split("\n").filter((line) => line.trim()) }))} value={chapter.lesson.objectives.join("\n")} />
        </AIGeneratedBlock>
        <AIGeneratedBlock onRegenerate={() => regenerate("explanation")} title="Lesson explanation">
          <textarea aria-label="Lesson explanation" className="editor-textarea" onChange={(event) => updateActiveLesson((lesson) => ({ ...lesson, explanation: event.target.value }))} rows={6} value={chapter.lesson.explanation} />
        </AIGeneratedBlock>
        <AIGeneratedBlock onRegenerate={() => regenerate("key terms")} title="Key terms">
          {chapter.lesson.keyTerms.length > 0 ? chapter.lesson.keyTerms.map((term) => (
            <div className="editor-term-row" key={term.id}><input aria-label={`${term.term} term`} onChange={(event) => updateActiveLesson((lesson) => ({ ...lesson, keyTerms: lesson.keyTerms.map((item) => item.id === term.id ? { ...item, term: event.target.value } : item) }))} value={term.term} /><input aria-label={`Definition of ${term.term}`} onChange={(event) => updateActiveLesson((lesson) => ({ ...lesson, keyTerms: lesson.keyTerms.map((item) => item.id === term.id ? { ...item, definition: event.target.value } : item) }))} value={term.definition} /></div>
          )) : <p className="editor-empty">No key terms yet. Add them as you review this chapter.</p>}
        </AIGeneratedBlock>
        <AIGeneratedBlock onRegenerate={() => regenerate("examples")} title="Examples">
          <textarea aria-label="Examples, one per line" className="editor-textarea" onChange={(event) => updateActiveLesson((lesson) => ({ ...lesson, examples: event.target.value.split("\n").filter((line) => line.trim()) }))} rows={3} value={chapter.lesson.examples.join("\n")} />
        </AIGeneratedBlock>
        <AIGeneratedBlock onRegenerate={() => regenerate("summary")} title="Chapter summary">
          <textarea aria-label="Chapter summary" className="editor-textarea" onChange={(event) => updateActiveLesson((lesson) => ({ ...lesson, summary: event.target.value }))} rows={2} value={chapter.lesson.summary} />
        </AIGeneratedBlock>
      </div>
    );
  }

  function renderVisualEditor() {
    return (
      <div className="editor-content">
        <div className="editor-block-heading"><h3>3D model preview</h3><span className="ai-generated-badge"><Icon name="sparkles" size={12} /> AI generated</span></div>
        <p className="editor-source-caption">{chapter.model.description}</p>
        <Suspense fallback={<div className="viewer-skeleton"><span className="skeleton-heart" />Loading the visual preview…</div>}>
          <CardiacViewer model={{ ...chapter.model, animationSteps: animationEnabled ? chapter.model.animationSteps : [] }} />
        </Suspense>
        <label className="animation-toggle"><input checked={animationEnabled} onChange={(event) => setAnimationEnabled(event.target.checked)} type="checkbox" /><span><strong>Include guided animation</strong><small>Let students follow the blood-flow steps alongside the model.</small></span></label>
        <AIGeneratedBlock onRegenerate={() => regenerate("model labels")} title="Model labels & hotspots">
          {chapter.model.hotspots.length > 0 ? chapter.model.hotspots.map((hotspot) => (
            <div className="editor-term-row" key={hotspot.id}><input aria-label={`Label ${hotspot.label}`} onChange={(event) => updateChapter(chapter.id, (current) => ({ ...current, model: { ...current.model, hotspots: current.model.hotspots.map((item) => item.id === hotspot.id ? { ...item, label: event.target.value } : item) } }))} value={hotspot.label} /><input aria-label={`Explanation for ${hotspot.label}`} onChange={(event) => updateChapter(chapter.id, (current) => ({ ...current, model: { ...current.model, hotspots: current.model.hotspots.map((item) => item.id === hotspot.id ? { ...item, explanation: event.target.value } : item) } }))} value={hotspot.explanation} /></div>
          )) : <p className="editor-empty">This chapter has no model labels yet.</p>}
        </AIGeneratedBlock>
      </div>
    );
  }

  function renderAssessmentEditor() {
    return (
      <div className="editor-content">
        <AIGeneratedBlock onRegenerate={() => regenerate("assessment")} title="Questions & answer key">
          {chapter.questions.length > 0 ? chapter.questions.map((question) => (
            <div className="editor-question" key={question.id}>
              <span className="eyebrow eyebrow-muted">{question.type.replace("-", " ")}</span>
              <textarea aria-label={`Question: ${question.prompt}`} className="editor-textarea" onChange={(event) => updateQuestion(question.id, (current) => ({ ...current, prompt: event.target.value }))} rows={2} value={question.prompt} />
              {question.type === "multiple-choice" && (
                <div className="editor-options">{question.options.map((option, index) => <label key={`${question.id}-${index}`}><input aria-label={`Correct answer: ${option}`} checked={question.correctAnswer === index} name={`correct-${question.id}`} onChange={() => updateQuestion(question.id, (current) => current.type === "multiple-choice" ? { ...current, correctAnswer: index } : current)} type="radio" /><input aria-label={`Answer option ${index + 1}`} onChange={(event) => updateQuestion(question.id, (current) => current.type === "multiple-choice" ? { ...current, options: current.options.map((item, optionIndex) => optionIndex === index ? event.target.value : item) } : current)} value={option} /></label>)}</div>
              )}
              {question.type === "true-false" && <label className="editor-inline-field">Correct answer<select onChange={(event) => updateQuestion(question.id, (current) => current.type === "true-false" ? { ...current, correctAnswer: event.target.value === "true" } : current)} value={String(question.correctAnswer)}><option value="true">True</option><option value="false">False</option></select></label>}
              {question.type === "fill-blank" && <label className="editor-inline-field">Correct answer<input onChange={(event) => updateQuestion(question.id, (current) => current.type === "fill-blank" ? { ...current, correctAnswer: event.target.value, acceptedAnswers: [event.target.value.toLowerCase()] } : current)} value={question.correctAnswer} /></label>}
              {question.type === "short-answer" && <label className="editor-rubric-field">Short-answer rubric<textarea aria-label="Short-answer rubric, one per line" className="editor-textarea" onChange={(event) => updateQuestion(question.id, (current) => current.type === "short-answer" ? { ...current, rubric: { ...current.rubric, criteria: event.target.value.split("\n").filter((line) => line.trim()), maximumScore: event.target.value.split("\n").filter((line) => line.trim()).length } } : current)} rows={3} value={question.rubric.criteria.join("\n")} /></label>}
            </div>
          )) : <p className="editor-empty">No questions yet. Add an assessment question after reviewing the lesson.</p>}
          <button className="button button-secondary add-question-button" onClick={() => updateChapter(chapter.id, (current) => ({ ...current, questions: [...current.questions, { id: `question-${Date.now()}`, type: "multiple-choice", chapterId: current.id, prompt: "Add a question", options: ["Option A", "Option B"], correctAnswer: 0, explanation: "Add an explanation for the answer." }] }))} type="button"><Icon name="plus" size={15} /> Add a question</button>
        </AIGeneratedBlock>
      </div>
    );
  }

  return (
    <div className="course-review-page">
      <div className="review-topbar"><Link className="back-link" to="/teacher"><Icon name="arrow-left" size={16} /> All courses</Link><span className="review-topbar-status"><span className={`status-pill status-${currentDraft.status.toLowerCase()}`}>{currentDraft.status}</span><button className="button button-secondary review-save-button" disabled={saveMutation.isPending || publishMutation.isPending} onClick={() => saveMutation.mutate(currentDraft)} type="button">{saveMutation.isPending ? "Saving…" : "Save draft"}</button></span></div>
      <header className="review-course-heading">
        <div><span className="eyebrow"><span className="eyebrow-dot" /> TEACHER REVIEW</span><input aria-label="Course title" className="review-course-title" onChange={(event) => setDraft({ ...currentDraft, title: event.target.value })} value={currentDraft.title} /><p>{currentDraft.sourceName} <span>·</span> {currentDraft.grade} {currentDraft.subject}</p></div>
        <div className="review-publish-area"><span>{currentDraft.chapters.filter((item) => item.status === "Approved").length} / {currentDraft.chapters.length} chapters approved</span><button className="button button-primary" disabled={!canPublish || publishMutation.isPending} onClick={saveAndPublish} title={canPublish ? "Publish this course" : "Approve every chapter to publish"} type="button">{publishMutation.isPending ? "Publishing…" : "Publish course"} <Icon name="arrow-right" size={16} /></button></div>
      </header>

      <div className="review-layout">
        <aside aria-label="Course chapter editor" className="review-sidebar panel">
          <div className="review-sidebar-title"><span className="eyebrow eyebrow-muted">COURSE OUTLINE</span><span>{currentDraft.chapters.length} chapters</span></div>
          <label className="review-meta-field">Subject<input onChange={(event) => setDraft({ ...currentDraft, subject: event.target.value })} value={currentDraft.subject} /></label>
          <label className="review-meta-field">Grade level<input onChange={(event) => setDraft({ ...currentDraft, grade: event.target.value })} value={currentDraft.grade} /></label>
          <div className="review-tree">{currentDraft.chapters.map((item, index) => (
            <div className={`review-tree-item${activeChapterId === item.id ? " review-tree-active" : ""}`} key={item.id}>
              <button aria-current={activeChapterId === item.id ? "page" : undefined} className="review-tree-select" onClick={() => setActiveChapterId(item.id)} type="button"><span className={`tree-status tree-status-${item.status.toLowerCase()}`} />{item.title}<small>{String(index + 1).padStart(2, "0")}</small></button>
              <div className="review-tree-actions">
                <button aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => reorderChapter(index, -1)} type="button"><Icon name="chevron-left" size={13} /></button>
                <button aria-label={`Move ${item.title} down`} disabled={index === currentDraft.chapters.length - 1} onClick={() => reorderChapter(index, 1)} type="button"><Icon name="chevron-right" size={13} /></button>
                <button aria-label={`Delete ${item.title}`} disabled={currentDraft.chapters.length <= 1} onClick={() => deleteChapter(item.id)} type="button"><Icon name="close" size={13} /></button>
              </div>
            </div>
          ))}</div>
          <button className="review-add-chapter" onClick={addChapter} type="button"><Icon name="plus" size={14} /> Add a chapter</button>
        </aside>

        <section aria-labelledby="active-chapter-title" className="review-main panel">
          <div className="active-chapter-heading">
            <div><span className="eyebrow eyebrow-muted">CHAPTER {currentDraft.chapters.indexOf(chapter) + 1} <span>·</span> {chapter.status.toUpperCase()}</span><input aria-label="Chapter name" id="active-chapter-title" onChange={(event) => updateChapter(chapter.id, (current) => ({ ...current, title: event.target.value }))} value={chapter.title} /></div>
            <label className="chapter-status-select">Status<select aria-label="Chapter status" onChange={(event) => setChapterStatus(event.target.value as ChapterStatus)} value={chapter.status}><option>Draft</option><option>Reviewed</option><option>Approved</option></select></label>
          </div>
          <div aria-label="Chapter editing sections" className="review-tabs" role="tablist">
            {tabs.map((tab) => <button aria-selected={activeTab === tab} className={`review-tab${activeTab === tab ? " review-tab-active" : ""}`} id={`review-tab-${tab}`} key={tab} onClick={() => setActiveTab(tab)} role="tab" type="button">{tab === "3D Visual" ? <Icon name="layers" size={15} /> : tab === "Assessment" ? <Icon name="target" size={15} /> : <Icon name="book" size={15} />}{tab}</button>)}
          </div>
          <div aria-labelledby={`review-tab-${activeTab}`} className="review-tab-panel" role="tabpanel">
            {activeTab === "Lesson" ? renderLessonEditor() : activeTab === "3D Visual" ? renderVisualEditor() : renderAssessmentEditor()}
          </div>
          <div className="review-main-footer">
            <span className="review-source-note"><Icon name="file" size={14} /> AI drafts are based on {currentDraft.sourceName}.</span>
            <div className="review-status-actions">
              {chapter.status === "Draft" && <button className="button button-secondary" onClick={() => setChapterStatus("Reviewed")} type="button">Mark reviewed</button>}
              {chapter.status === "Reviewed" && <button className="button button-primary" onClick={() => setChapterStatus("Approved")} type="button"><Icon name="check" size={15} /> Approve chapter</button>}
              {chapter.status === "Approved" && <span className="approved-indicator"><Icon name="check" size={14} /> Approved</span>}
            </div>
          </div>
          <p aria-live="polite" className="review-notice" role={errorMessage ? "alert" : "status"}>{errorMessage || notice}</p>
        </section>
      </div>
    </div>
  );
}
