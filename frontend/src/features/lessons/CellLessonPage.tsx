import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { CellModel, cellParts, type CellPart } from "@/features/lessons/CellModel";
import { useDemo } from "@/app/providers/DemoProvider";
import { getLearningSteps } from "@/lib/api";

const quizAnswers = [
  "It stores water and helps the plant cell stay firm.",
  "It controls which genes are copied.",
  "It captures sunlight to make glucose.",
];

export function CellLessonPage() {
  const { role } = useDemo();
  const [selectedPart, setSelectedPart] = useState<CellPart>("nucleus");
  const [isPlaying, setIsPlaying] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const currentPart = cellParts[selectedPart];
  const stepsQuery = useQuery({
    queryKey: ["demo", "learning-steps", "cell-biology"],
    queryFn: () => getLearningSteps("cell-biology"),
  });
  if (stepsQuery.isError) throw stepsQuery.error;
  if (stepsQuery.isPending) {
    return <p aria-live="polite" className="page-loading" role="status">Loading this lesson…</p>;
  }

  return (
    <div className="lesson-page">
      <div className="lesson-back-row">
        <Link className="back-link" to={role === "teacher" ? "/teacher" : "/student"}><Icon name="arrow-left" size={17} /> Back to your learning</Link>
        <div className="lesson-breadcrumb"><span>The living cell</span><Icon name="chevron-right" size={14} /><strong>Chapter 3</strong></div>
      </div>

      <div className="lesson-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> CHAPTER 3 <span className="eyebrow-separator">·</span> 8 MIN READ</div>
          <h1>Meet the <span>organelles.</span></h1>
          <p>Every cell has a tiny team working together. Let’s get to know the players.</p>
        </div>
        <div aria-label="Chapter progress: 2 of 3 steps complete" className="lesson-progress">
          <span>YOUR PROGRESS <strong>2 / 3</strong></span>
          <div className="progress-track"><span style={{ width: "66%" }} /></div>
        </div>
      </div>

      <div className="lesson-main-grid">
        <div className="lesson-primary">
          <CellModel isPlaying={isPlaying} onSelectPart={setSelectedPart} selectedPart={selectedPart} />

          <section aria-labelledby="lesson-explanation-title" aria-live="polite" className="explanation-card">
            <div className="explanation-heading">
              <span className="explanation-icon"><Icon name="sparkles" size={17} /></span>
              <div><span className="eyebrow eyebrow-muted">ZOOM IN</span><h2 id="lesson-explanation-title">{currentPart.label}</h2></div>
            </div>
            <p>{currentPart.description}</p>
            <div className="explanation-footnote"><Icon name="lightbulb" size={15} /> <span>Think of it as one part of a bigger team—each organelle has its own job.</span></div>
          </section>

          <section aria-labelledby="check-title" className="quiz-card">
            <div className="quiz-kicker"><Icon name="target" size={16} /> QUICK CHECK <span>1 question</span></div>
            <h2 id="check-title">What does the central vacuole do?</h2>
            <div aria-label="Answer choices" className="answer-list" role="group">
              {quizAnswers.map((choice, index) => {
                const isCorrect = index === 0;
                const isSelected = answer === index;
                return (
                  <button
                    aria-pressed={isSelected}
                    className={`answer-option${isSelected ? " answer-selected" : ""}${answer !== null && isSelected && isCorrect ? " answer-correct" : ""}${answer !== null && isSelected && !isCorrect ? " answer-incorrect" : ""}`}
                    key={choice}
                    onClick={() => setAnswer(index)}
                    type="button"
                  >
                    <span className="answer-letter">{String.fromCharCode(65 + index)}</span>{choice}
                    {answer !== null && isSelected && <Icon name={isCorrect ? "check" : "close"} size={17} />}
                  </button>
                );
              })}
            </div>
            {answer !== null && (
              <p aria-live="polite" className={`quiz-feedback${answer === 0 ? " feedback-correct" : ""}`}>
                <Icon name={answer === 0 ? "check" : "lightbulb"} size={16} />
                {answer === 0 ? "That’s right! The vacuole stores water and helps keep the cell firm." : "Not quite. Look for the answer about storing water and supporting the cell."}
              </p>
            )}
          </section>
        </div>

        <aside className="lesson-sidebar">
          <section aria-labelledby="chapter-steps-title" className="panel chapter-panel">
            <div className="sidebar-heading"><span className="eyebrow eyebrow-muted">CHAPTER 3</span><button aria-label="Chapter options" className="icon-button subtle-button" type="button"><Icon name="more" size={18} /></button></div>
            <h2 id="chapter-steps-title">Cell structure & function</h2>
            <div className="step-list">
              {stepsQuery.data.map((step) => (
                <div className={`learning-step step-${step.state}`} key={step.id}>
                  <span className="step-marker">{step.state === "complete" ? <Icon name="check" size={13} /> : step.state === "current" ? <span /> : null}</span>
                  <span className="step-copy"><strong>{step.title}</strong><small><Icon name="clock" size={13} /> {step.duration}</small></span>
                </div>
              ))}
            </div>
            <div className="chapter-source"><Icon name="file" size={16} /><span><strong>From your textbook</strong><small>Chapter 4 · pages 82–85</small></span><Icon name="chevron-right" size={16} /></div>
          </section>

          <section aria-labelledby="animation-title" className="animation-card">
            <div className="animation-topline"><span><span className="animation-pulse" /> GUIDED ANIMATION</span><span>0:18</span></div>
            <div className={`animation-visual${isPlaying ? " animation-active" : ""}`} aria-hidden="true">
              <div className="animation-plant-cell"><span className="animation-chloro c-one" /><span className="animation-chloro c-two" /><span className="animation-nucleus" /></div>
              <span className="animation-energy energy-one" /><span className="animation-energy energy-two" /><span className="animation-energy energy-three" />
            </div>
            <h2 id="animation-title">A cell at work</h2>
            <p>Follow sunlight as a chloroplast turns it into energy the cell can use.</p>
            <p className="animation-description"><strong>Animation description:</strong> Light particles enter the cell and reach a chloroplast, where they help make glucose.</p>
            <button
              aria-pressed={isPlaying}
              className="button button-animation"
              onClick={() => setIsPlaying((playing) => !playing)}
              type="button"
            >
              <Icon name={isPlaying ? "pause" : "play"} size={16} /> {isPlaying ? "Pause animation" : "Play animation"}
            </button>
          </section>

          <div className="lesson-help"><span className="help-icon"><Icon name="circle-help" size={17} /></span><span><strong>Need another way in?</strong><small>Ask for a different explanation, any time.</small></span><button aria-label="Get another explanation" className="icon-button subtle-button" type="button"><Icon name="arrow-right" size={17} /></button></div>
        </aside>
      </div>

      <div className="lesson-footer-nav">
        <button className="button button-secondary" type="button"><Icon name="arrow-left" size={16} /> Previous lesson</button>
        <button className="button button-primary" onClick={() => setAnswer(0)} type="button">Finish this chapter <Icon name="arrow-right" size={16} /></button>
      </div>
    </div>
  );
}
