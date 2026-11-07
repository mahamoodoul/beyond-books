# ADR 0011: Assessments, versioned attempts and advisory AI grading

- **Status:** Proposed — interim answer to open decision #8 (assessment policy)
- **Date:** 2026-11-07

## Decision

**Policy: AI is advisory.** Multiple-choice is scored automatically. Short-answer scores become
final **only** when a teacher accepts or overrides the AI suggestion. Until then the student sees
a provisional score and AI feedback clearly labelled as provisional. (Design §23 lists
"autonomous grading without teacher oversight" as out of scope.)

**Data**
- `assessments.content` holds the draft as a validated `AssessmentContent` (MCQ: 2–6 options,
  exactly one correct; short answer: rubric points must equal question points). Questions and
  options get stable keys (`q1`, `oa`…).
- Publishing freezes an `assessment_versions` snapshot (incl. answer keys and rubrics). Attempts
  reference the version they were taken on, so edits never change graded work or rubrics.
  (Design §8.2's normalised question/option/rubric tables are replaced by these snapshots;
  analytics use `(assessment_version, question_key)`.)
- `student_answers` + `evaluation_results` keep the AI suggestion (score, feedback, missing
  concepts, confidence) separate from the teacher's final score and feedback; every review is
  audited (`evaluation.accepted` / `evaluation.overridden`).

**Security**
- Students never receive `is_correct`, rubrics, model answers or explanations before submitting.
- Attempts are per student (404 for anyone else); attempt limits enforced; an open attempt is
  resumed instead of consuming another.
- Answer evaluation sends only the question, rubric, model answer and the answer text (wrapped as
  untrusted data) — no student identity.

**AI features**
- Assessment generation from chapter sources and objectives → draft assessment (`origin=ai`);
  invalid questions dropped, rubric points normalised.
- Explain Further (student-triggered, 20/day): grounded in the chapter's **published** lessons,
  returns an explanation plus a link to the lesson section to revise.
