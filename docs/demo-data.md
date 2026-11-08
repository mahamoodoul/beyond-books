# Demo data

`scripts/seed_demo.py` fills a running Edu3D API with a demo school, so the teacher and student
experiences can be shown without preparing content by hand. All names, accounts and results are
synthetic.

```sh
make seed-demo                                  # API at http://localhost:8000
make seed-demo API=https://staging.example.org  # any running API
python3 scripts/seed_demo.py --password 'Another-demo-pass1' --with-ai
```

Requirements: the API is running and migrated, `EDU3D_OPEN_REGISTRATION=true` (the default),
and the demo GLBs are fetched from Git LFS (`git lfs pull`). The script uses the standard
library only and talks to the API over HTTP, so every business rule (publishing, school
membership, enrolment) is applied exactly as in the app.

## What it creates

| | |
|---|---|
| School | **Riverside Academy (Demo)** (`riverside-academy-demo`); Ms Okafor is the school admin |
| Teachers | `amara.okafor@demo.example.org`, `daniel.reyes@demo.example.org` |
| Classrooms | Year 8 Biology – Set A (6 students), Set B (6 students); both teachers in both |
| Students | 12 accounts, `firstname.lastname@demo.example.org` (printed at the end of the run) |
| Password | `DemoPassword2026!` for every account unless `--password` is given |
| 3D library | Brain, lungs, heart (v2), human body and plant cell GLBs uploaded as approved school assets |

**Human Body Systems** (Ms Okafor, both classrooms): four chapters (brain, lungs, heart, the
organs together). Each has learning objectives, lessons, a published 3D scene with its tour
animation, and a multiple-choice quiz.

**Cells: The Building Blocks of Life** (Mr Reyes, Set B): one plant cell chapter with a 3D scene
and quiz.

### Source textbook

Each course gets a textbook PDF as a source document. These are excerpts from OpenStax *Concepts
of Biology* in `packages/demo-assets/books/` (licence and attribution in the README there).
Each chapter's source references point at the matching pages, so **Source** in the chapter
studio shows the textbook text, and AI generation for that chapter works from it.

| Course | PDF | Chapter → pages |
|---|---|---|
| Human Body Systems | Ch. 16 The Body's Systems (50 pages) | Brain → 32–41 (16.6 Nervous System), Lungs and Heart → 14–20 (16.3), Organs → 3–7 (16.1) |
| Cells | Ch. 3 Cell Structure and Function (36 pages) | Inside a Plant Cell → 8–22 (3.3 Eukaryotic Cells, 3.4 The Cell Membrane) |

The book is uploaded for courses that already exist as well, so re-running the script adds it to
an earlier demo. The excerpts are CC BY-NC-SA 4.0: for demos and development only, not for
commercial use.

### Student activity

Each student follows a profile, so the class analytics show a realistic spread:

| Profile | Lessons completed | Quiz accuracy | Retakes a failed quiz |
|---|---|---|---|
| high | all | ~95% | – |
| steady | ~85% | ~75% | yes |
| average | ~60% | ~60% | yes |
| struggling | ~45% | ~35% | yes |
| starting | ~15% | – | – |
| inactive | none | – | – |

Activity includes lesson opens, 3D scene opens, part selections, tour animations and quiz
attempts. It is random but repeatable (`--seed`, default 2026). Timestamps are the time of the
run: the API does not allow backdating.

`--with-ai` adds a short-answer question to three quizzes. Those answers are marked by the
configured LLM provider (it costs tokens unless `EDU3D_LLM_PROVIDER=fake`) and then appear in
the teacher's review queue.

## Running it again

The script can be re-run safely. Accounts, the school, classrooms and assets are reused. A
published course with the same title is left alone, and its student activity is not repeated.
A draft left behind by an interrupted run is cleared and rebuilt.

The login limit allows 50 logins per IP every 15 minutes, and each run logs in 14 accounts. If
you re-run more than three times in a row, wait, or raise `EDU3D_LOGIN_MAX_ATTEMPTS` locally.

To start fresh, reset the database (`scripts/restore_db.sh`, or recreate the local database) and
run the script again. There is no API for deleting courses.
