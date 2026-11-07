# ADR 0012: Teacher analytics and knowledge-gap records

- **Status:** Proposed — Phase 9
- **Date:** 2026-11-07

## Decision

- Analytics are computed on request from stored evidence (lesson progress, latest submitted
  attempt per student and assessment, teacher-final evaluation scores). Pilot scale (≤100 users)
  does not need pre-aggregation; add materialised views or a worker job if queries grow.
- **Mastery** per (student, learning objective) = earned ÷ possible points on questions linked to
  that objective. Only final scores count: auto-scored MCQ and teacher-reviewed short answers.
  Unreviewed AI suggestions never influence mastery. Status thresholds: gap < 50 %,
  developing < 80 %, mastered ≥ 80 %. Results are upserted into `learning_gap_records`.
- **Insights** are deterministic rules (objective gaps ≥ 40 % of students, questions with < 50 %
  of points earned, low lesson completion, pending reviews, inactive students, frequent missing
  concepts). No LLM is used for teacher insights yet, so nothing is invented and no student data
  leaves the system for this feature.
- **Privacy threshold:** class-level distributions (most common wrong answers, missing concepts)
  are hidden when fewer than 3 students are enrolled. Teachers still see their own students'
  individual results, which they are entitled to.
- Students can see their own objective mastery and revision recommendations (lessons linked to
  questions they lost points on); never other students' data.
- Charts follow the dataviz rules: single-hue magnitude bars with printed values, status colours
  (gap/developing/mastered) always paired with an icon and label.
