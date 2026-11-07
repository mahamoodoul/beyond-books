import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/Icon";
import { getCourse, submitAttempt } from "@/lib/api";
import type { Attempt, Question } from "@/lib/types";

type AnswerValue = string | number | boolean;

function QuestionAnswer({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (answer: AnswerValue) => void;
}) {
  if (question.type === "multiple-choice") {
    return (
      <div aria-label="Answer choices" className="assessment-options" role="group">
        {question.options.map((option, index) => (
          <button
            aria-pressed={value === index}
            className={`assessment-option${value === index ? " assessment-option-selected" : ""}`}
            key={option}
            onClick={() => onChange(index)}
            type="button"
          >
            <span className="assessment-option-key">{String.fromCharCode(65 + index)}</span>{option}
            {value === index && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
    );
  }
  if (question.type === "true-false") {
    return (
      <div aria-label="Answer true or false" className="assessment-options assessment-binary" role="group">
        {[true, false].map((answer) => (
          <button
            aria-pressed={value === answer}
            className={`assessment-option${value === answer ? " assessment-option-selected" : ""}`}
            key={String(answer)}
            onClick={() => onChange(answer)}
            type="button"
          >
            {answer ? "True" : "False"}{value === answer && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
    );
  }
  if (question.type === "fill-blank") {
    const word = question.prompt.replace("____", "__________");
    const [before, after] = word.split("__________");
    return (
      <label className="fill-blank-answer">
        <span className="visually-hidden">Your answer</span>
        <span>{before}</span>
        <input aria-label="Fill in the missing word" onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : ""} />
        <span>{after}</span>
      </label>
    );
  }
  return (
    <label className="short-answer-field">
      <span>Your explanation</span>
      <textarea
        aria-label="Write your answer"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write what you know in your own words…"
        rows={5}
        value={typeof value === "string" ? value : ""}
      />
      <small>Use the rubric to help shape your answer.</small>
    </label>
  );
}

function QuestionReview({ attempt, question }: { attempt: Attempt; question: Question }) {
  const answer = attempt.answers.find((item) => item.questionId === question.id);
  if (!answer) return null;
  return (
    <article className={`assessment-review-item${answer.correct ? " review-correct" : " review-needs-work"}`}>
      <div className="assessment-review-heading">
        <span className={`review-result-icon${answer.correct ? "" : " review-result-missed"}`}>
          <Icon name={answer.correct ? "check" : "close"} size={16} />
        </span>
        <span><strong>{question.prompt}</strong><small>{answer.correct ? "Nice work" : "A good one to revisit"}</small></span>
      </div>
      <p>{answer.feedback}</p>
      {question.type === "short-answer" && (
        <div className="ai-review-box">
          <div className="ai-review-heading"><Icon name="sparkles" size={15} /> MOCK AI EVALUATION <strong>{answer.correct ? "2" : "1"} / {question.rubric.maximumScore}</strong></div>
          <ul>
            {question.rubric.criteria.map((criterion, index) => {
              const covered = answer.correct ? index < 2 : index === 0;
              return <li className={covered ? "rubric-covered" : "rubric-missing"} key={criterion}><Icon name={covered ? "check" : "close"} size={13} />{criterion}</li>;
            })}
          </ul>
          <p><strong>Try this next:</strong> Mention what happens to blood in the lungs before it returns to the heart.</p>
        </div>
      )}
      {!answer.correct && (
        <Link className="revisit-link" to={`/student/courses/${attempt.courseId}/lessons/${question.chapterId}`}>
          Revisit this topic <Icon name="arrow-up-right" size={14} />
        </Link>
      )}
    </article>
  );
}

function AssessmentResults({ attempt, questions }: { attempt: Attempt; questions: Question[] }) {
  const percentage = Math.round((attempt.score / Math.max(1, attempt.maximumScore)) * 100);
  return (
    <div className="assessment-results">
      <div className="assessment-result-intro">
        <span className="assessment-result-sparkle"><Icon name="sparkles" size={18} /></span>
        <span className="eyebrow eyebrow-muted">YOUR CHECK-IN</span>
        <h1>Look how far you’ve come.</h1>
        <p>Every question is a clue about what to explore next.</p>
      </div>
      <div className="score-summary panel">
        <div aria-label={`${percentage}% score`} className="score-ring" role="img" style={{ background: `conic-gradient(var(--accent) ${percentage}%, var(--surface-quiet) 0)` }}>
          <span><strong>{attempt.score}/{attempt.maximumScore}</strong><small>correct</small></span>
        </div>
        <div className="score-summary-copy">
          <span className="eyebrow eyebrow-muted">A SOLID STEP FORWARD</span>
          <h2>{percentage >= 75 ? "You’re getting the picture." : "You’ve got a good start."}</h2>
          <p>Strong understanding grows one connection at a time.</p>
          <div className="score-concept-chips">{attempt.conceptsCovered.map((concept) => <span className="concept-chip concept-chip-covered" key={concept}><Icon name="check" size={12} />{concept}</span>)}</div>
        </div>
      </div>
      {attempt.conceptsMissing.length > 0 && (
        <section className="revision-note">
          <span><Icon name="lightbulb" size={16} /></span>
          <div><strong>A thought to revisit</strong><p>{attempt.conceptsMissing.join(", ")}</p><small>{attempt.suggestedRevision}</small></div>
        </section>
      )}
      <section aria-labelledby="review-answers-title" className="assessment-reviews">
        <div className="section-heading">
          <div><span className="eyebrow eyebrow-muted">QUESTION BY QUESTION</span><h2 id="review-answers-title">Your answers</h2></div>
        </div>
        {questions.map((question) => <QuestionReview attempt={attempt} key={question.id} question={question} />)}
      </section>
      <div className="assessment-result-actions">
        <Link className="button button-secondary" to={`/student/courses/${attempt.courseId}/lessons/${attempt.chapterId}`}><Icon name="arrow-left" size={16} /> Back to the lesson</Link>
        <Link className="button button-primary" to="/student/progress">See your progress <Icon name="arrow-right" size={16} /></Link>
      </div>
    </div>
  );
}

export function AssessmentPage() {
  const { courseId = "circulatory-system" } = useParams();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [allQuestionsVisible, setAllQuestionsVisible] = useState(false);
  const courseQuery = useQuery({ queryKey: ["course", courseId], queryFn: () => getCourse(courseId) });
  const submitMutation = useMutation({
    mutationFn: () => submitAttempt(courseId, {
      studentId: "student-1",
      answers: questions.map((question) => ({ questionId: question.id, answer: answers[question.id]! })),
    }),
  });
  if (courseQuery.isError) throw courseQuery.error;
  if (courseQuery.isPending) return <p className="page-loading" role="status">Gathering your questions…</p>;

  const course = courseQuery.data;
  const questions = course.chapters.flatMap((chapter) => chapter.questions);
  if (questions.length === 0) throw new Error("This course has no assessment questions yet.");
  if (submitMutation.isError) throw submitMutation.error;
  if (submitMutation.data) return <AssessmentResults attempt={submitMutation.data} questions={questions} />;

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) throw new Error(`Question ${currentIndex + 1} is not available.`);
  const allAnswered = questions.every((question) => {
    const answer = answers[question.id];
    return answer !== undefined && String(answer).trim() !== "";
  });

  function answerQuestion(questionId: string, answer: AnswerValue) {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
  }

  function questionCard(question: Question, index: number) {
    return (
      <article aria-labelledby={`question-title-${question.id}`} className="assessment-question-card panel" key={question.id}>
        <div className="assessment-question-meta"><span>QUESTION {index + 1}</span><span>{question.type.replace("-", " ")}</span></div>
        <h2 id={`question-title-${question.id}`}>{question.prompt}</h2>
        <QuestionAnswer onChange={(answer) => answerQuestion(question.id, answer)} question={question} value={answers[question.id]} />
        {question.type === "short-answer" && <p className="rubric-hint"><Icon name="sparkles" size={14} /> Your answer will get a demo AI review against {question.rubric.criteria.length} rubric points.</p>}
      </article>
    );
  }

  return (
    <div className="assessment-page">
      <div className="assessment-back-row"><Link className="back-link" to={`/student/courses/${course.id}/lessons/heart-structure`}><Icon name="arrow-left" size={16} /> Back to the lesson</Link><span>{course.title}</span></div>
      <header className="assessment-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> A QUICK CHECK-IN</div><h1>What’s clicking?</h1><p>Take your time. This is a chance to see what you know and what you might revisit.</p></div>
        <button aria-pressed={allQuestionsVisible} className="button button-secondary question-mode-toggle" onClick={() => setAllQuestionsVisible((value) => !value)} type="button">
          <Icon name="layers" size={15} /> {allQuestionsVisible ? "One at a time" : "See all questions"}
        </button>
      </header>
      <div aria-label={`Question ${currentIndex + 1} of ${questions.length}`} className="assessment-progress">
        <span>YOUR PROGRESS <strong>{currentIndex + 1} / {questions.length}</strong></span>
        <div className="progress-track"><span style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
      </div>

      {allQuestionsVisible ? (
        <div className="assessment-question-list">
          {questions.map((question, index) => questionCard(question, index))}
        </div>
      ) : (
        <div className="assessment-single-question">{questionCard(currentQuestion, currentIndex)}</div>
      )}

      {!allQuestionsVisible && (
        <div className="assessment-step-actions">
          <button className="button button-secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} type="button"><Icon name="arrow-left" size={16} /> Previous</button>
          {currentIndex < questions.length - 1 ? (
            <button className="button button-primary" disabled={answers[currentQuestion.id] === undefined || String(answers[currentQuestion.id]).trim() === ""} onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))} type="button">Next question <Icon name="arrow-right" size={16} /></button>
          ) : (
            <button className="button button-primary" disabled={!allAnswered || submitMutation.isPending} onClick={() => submitMutation.mutate()} type="button">{submitMutation.isPending ? "Checking your answers…" : "See how I did"} <Icon name="arrow-right" size={16} /></button>
          )}
        </div>
      )}
      {allQuestionsVisible && (
        <div className="assessment-step-actions">
          <span className="assessment-answered-count">{Object.keys(answers).length} of {questions.length} answered</span>
          <button className="button button-primary" disabled={!allAnswered || submitMutation.isPending} onClick={() => submitMutation.mutate()} type="button">{submitMutation.isPending ? "Checking your answers…" : "Submit answers"} <Icon name="arrow-right" size={16} /></button>
        </div>
      )}
    </div>
  );
}
