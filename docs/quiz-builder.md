# Quiz builder

The quiz builder extends teacher-authored quizzes beyond multiple choice and short answer. Its
design takes ideas from the Tutor LMS quiz builder (sources below), adapted to Edu3D. The main
adaptation is a question type that uses the course's 3D models.

## Status

| Part | State |
|---|---|
| Question contract: 7 new types, validation, stable keys | Done (`assessments/content.py`) |
| Quiz settings: saved, versioned, frozen at publish | Done (`QuizSettings`, migration 0012) |
| 3D question links checked against the course's scenes | Done |
| Teacher builder screens (type picker, editors, settings panel, preview) | To do |
| Student side: answering, auto-marking, timer, shuffling, reveal policy | To do (reverted from the first pass) |

Until the student side exists, **publishing is blocked** for quizzes that contain any of the new
types (`STUDENT_READY_TYPES` in `assessments/service.py`). Teachers can save them as drafts.

## Question types

| Type | Teacher provides | Student will | Tutor LMS equivalent |
|---|---|---|---|
| `mcq` (existing) | 2–8 options, one correct | pick one | Multiple Choice |
| `short_answer` (existing) | rubric and model answer | write; AI suggests a score, teacher decides | Short Answer / Open Ended |
| `true_false` | options True and False, one correct | pick one | True/False |
| `multiple_select` | 2–8 options, at least one correct | pick all that apply | Multiple Choice (multiple answers) |
| `fill_blanks` | `cloze_text` with `{{answer\|alternative}}` blanks, case sensitivity | type into each blank | Fill in the Blanks |
| `matching` | 2–10 prompt → match pairs, optional decoy answers | match each prompt | Matching |
| `ordering` | 3–10 items in the correct order | put shuffled items in order | Ordering |
| `numeric` | answer, allowed margin (tolerance), unit | type a number | Range |
| `hotspot_3d` | a 3D scene from the course and the correct part(s) | click the part on the model | Image Marking / Pin, using our 3D scenes |

Image-based types (Image Answering, Image Matching) are left out because quizzes have no image
hosting yet. Graph and Puzzle are out of scope.

## Quiz settings (`QuizSettings`)

| Setting | Default | Tutor LMS equivalent |
|---|---|---|
| `time_limit_minutes` | none | Set Time Limit |
| `shuffle_questions` | false | Question Order: Random |
| `shuffle_options` | false | – |
| `questions_per_attempt` | all | Limit questions to answer (random draw from the pool) |
| `partial_credit` | true | Partial marking (multiple select, blanks, matching, ordering) |
| `reveal_answers` | `after_submit` (or `after_last_attempt`, `never`) | Reveal answers after submission |
| `layout` | `all` (or `one_per_page`) | Layout: Full Page / Single Question |
| `allow_back` | true | Hide previous button (inverted) |

Pass mark and attempt limit remain columns on the assessment, as before. Changing settings
creates a new version, so it only reaches students after republishing, just like question edits.
Negative marking and auto-start were considered and left out.

## Sources

- Tutor LMS, *Quiz Builder*: <https://tutorlms.com/docs/quiz-builder/quiz-builder/> (question
  types and builder flow)
- Tutor LMS, *Quiz Settings*: <https://tutorlms.com/docs/quiz-builder/quiz-settings/> (question
  order, attempt limits, question pool, passing grade, partial and negative marking, time
  limit, layout, answer reveal, back button)

The Tutor LMS pages were used for inspiration only. No code or text was copied.
