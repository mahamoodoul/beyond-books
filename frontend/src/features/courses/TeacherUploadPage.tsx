import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { Icon } from "@/components/ui/Icon";
import { createCourse, sourceMime, updateCourse, uploadSource, waitForJob } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const pipeline = ["Creating your course", "Uploading source material", "Extracting text", "Ready for teacher review"];

export function TeacherUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [subject, setSubject] = useState("Biology");
  const [grade, setGrade] = useState("Grade 8");
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState(-1);
  const [stepProgress, setStepProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);

  function acceptFile(nextFile: File | undefined) {
    if (!nextFile) return;
    setErrorMessage("");
    if (!/\.(pdf|txt|md)$/i.test(nextFile.name)) {
      setFile(null);
      setErrorMessage("Choose a PDF, text, or Markdown file.");
      return;
    }
    if (!nextFile.size || nextFile.size > 25 * 1024 * 1024) {
      setFile(null);
      setErrorMessage("Choose a non-empty source file smaller than 25 MB.");
      return;
    }
    setFile(nextFile);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  async function runPipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMessage("");

    try {
      sourceMime(file);
      setStep(0); setStepProgress(0);
      const details = { title: courseTitle.trim(), subject, grade_level: grade };
      const course = createdCourseId ? await updateCourse(createdCourseId, details) : await createCourse(details);
      setCreatedCourseId(course.id);
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setStep(1); setStepProgress(0);
      const result = await uploadSource(course.id, file);
      setStep(2); setStepProgress(0);
      await waitForJob(result.job);
      setStep(3); setStepProgress(100);
      await qc.invalidateQueries({ queryKey: ["documents", course.id] });
      navigate(`/teacher/courses/${course.id}/review`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The source could not be processed. Please try again.");
      setIsAnalyzing(false);
      setStep(-1);
      setStepProgress(0);
    }
  }

  async function createBlankCourse() {
    if (!courseTitle.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMessage("");
    try {
      const details = { title: courseTitle.trim(), subject, grade_level: grade };
      const course = createdCourseId ? await updateCourse(createdCourseId, details) : await createCourse(details);
      await qc.invalidateQueries({ queryKey: ["courses"] });
      navigate(`/teacher/courses/${course.id}/review`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create your course.");
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="upload-page">
      <div className="upload-breadcrumb"><Link to="/teacher">Teacher space</Link><Icon name="chevron-right" size={14} /><strong>New course</strong></div>
      <header className="upload-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> TEACHER WORKSPACE</div><h1>Start with a source.</h1><p>Bring your material. We’ll help shape it into a course you can review and make your own.</p></div>
        <span className="upload-step-counter">01 <span>/</span> 02</span>
      </header>

      <form className="upload-form" onSubmit={runPipeline}>
        <section aria-labelledby="source-title" className="upload-main">
          <div className="panel upload-source-panel">
            <div className="upload-section-heading"><span className="upload-section-icon"><Icon name="file" size={18} /></span><span><small>STEP 1</small><strong id="source-title">Add a textbook or reference</strong></span></div>
            {!file ? (
              <div
                className={`upload-dropzone${dragging ? " upload-dropzone-active" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <input accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" aria-label="Upload a source file" className="visually-hidden" onChange={onFileChange} ref={fileInputRef} type="file" />
                <span className="upload-cloud-icon"><Icon name="download" size={22} /></span>
                <strong>Drop your source here, or <button className="inline-upload-trigger" onClick={() => fileInputRef.current?.click()} type="button">browse files</button></strong>
                <span>PDF, text, or Markdown up to 25 MB</span>
                <span className="upload-trust"><Icon name="check" size={12} /> Source material stays in your classroom workspace</span>
              </div>
            ) : (
              <div className="source-file-card">
                <span className="source-file-icon"><Icon name="file" size={20} /></span>
                <span className="source-file-details"><strong>{file.name}</strong><small>{(file.size / (1024 * 1024)).toFixed(2)} MB <span>·</span> Source document</small></span>
                <button aria-label={`Remove ${file.name}`} className="icon-button subtle-button" onClick={() => setFile(null)} type="button"><Icon name="close" size={17} /></button>
                <span className="source-ready"><Icon name="check" size={13} /> Ready</span>
              </div>
            )}
            {errorMessage && <p className="upload-error" role="alert"><Icon name="circle-help" size={15} />{errorMessage}</p>}

            {createdCourseId && <p className="upload-note"><Link className="text-link" to={`/teacher/courses/${createdCourseId}/review`}>Open your saved course to review or retry processing</Link></p>}
            <div className="upload-fields">
              <label>Course title<input onChange={(event) => setCourseTitle(event.target.value)} required value={courseTitle} /></label>
              <div className="upload-fields-row">
                <label>Subject<select onChange={(event) => setSubject(event.target.value)} value={subject}><option>Biology</option><option>Physics</option><option>Chemistry</option><option>World history</option><option>Earth science</option></select></label>
                <label>Grade level<select onChange={(event) => setGrade(event.target.value)} value={grade}>{[6, 7, 8, 9, 10, 11, 12].map((level) => <option key={level}>Grade {level}</option>)}</select></label>
              </div>
            </div>
          </div>

          <aside className="upload-note">
            <span><Icon name="lightbulb" size={17} /></span>
            <div><strong>You’re always in the driver’s seat.</strong><p>AI drafts the starting point. You review every chapter, edit what matters, and choose what’s ready to share.</p></div>
          </aside>
        </section>

        <aside aria-labelledby="pipeline-title" className="panel pipeline-panel">
          <div className="pipeline-heading"><span className="eyebrow eyebrow-muted">STEP 2</span><h2 id="pipeline-title">A little help from AI</h2><p>Upload your source, then review its extracted text and generate an outline in your course.</p></div>
          <ol className="pipeline-list">
            {pipeline.map((item, index) => {
              const isComplete = step > index || (step === index && stepProgress === 100);
              const isCurrent = step === index && stepProgress < 100;
              return (
                <li className={`pipeline-step${isComplete ? " pipeline-step-complete" : ""}${isCurrent ? " pipeline-step-current" : ""}`} key={item}>
                  <span className="pipeline-marker">{isComplete ? <Icon name="check" size={12} /> : isCurrent && isAnalyzing ? <span className="pipeline-spinner" /> : <span>{String(index + 1).padStart(2, "0")}</span>}</span>
                  <span className="pipeline-copy"><strong>{item}</strong>{isCurrent && isAnalyzing && <span className="pipeline-progress"><span style={{ width: `${stepProgress}%` }} /></span>}</span>
                  {isComplete && <span className="pipeline-done">Done</span>}
                </li>
              );
            })}
          </ol>
          <div className="pipeline-privacy"><Icon name="eye" size={15} /><span>Your review always comes before publishing.</span></div>
          <button className="button button-primary upload-submit" disabled={!file || isAnalyzing || !courseTitle.trim()} type="submit">
            {isAnalyzing ? <>Preparing your source <span className="button-spinner" /></> : <>Upload & prepare course <Icon name="arrow-right" size={16} /></>}
          </button>
          <button className="button button-secondary upload-submit" disabled={isAnalyzing || !courseTitle.trim()} onClick={() => void createBlankCourse()} type="button">Create a blank course</button>
          <p aria-live="polite" className="pipeline-status" role="status">{isAnalyzing ? pipeline[step] : file ? "Text extraction may take a few moments." : "Add a source to get started."}</p>
        </aside>
      </form>
    </div>
  );
}
