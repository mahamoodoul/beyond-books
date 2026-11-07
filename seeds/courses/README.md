# Shared course seed

The four sample courses (Biology, Chemistry, Mathematics, Physics) with everything built so far:
chapters, learning objectives, the extracted textbook text, lessons, quizzes, 3D scenes, the 3D
models they use (`files/`, Git LFS) and the saved AI prompts. Importing makes **no AI calls**.

## Load it (collaborators)

```bash
git lfs pull                         # course PDFs (sample-courses/) and 3D models (files/)
make migrate                         # database schema up to date
# register a teacher account in the app (or use one you have), then:
make seed-courses EMAIL=you@example.com
```

Restart the backend if it was running, then open **My courses**. Re-running is safe: what is
already there is skipped.

## Update it (after adding more lessons / 3D)

```bash
make export-courses EMAIL=teacher@gmail.com   # writes seeds/courses/
git add seeds/courses && git commit -m "Update course seed"
```

## What's inside

- `bundle.json`: the database rows (ids kept, so all links stay valid). The importing teacher
  becomes the owner; school links are cleared.
- `files/`: 3D model files (`.glb`).
- Course PDFs are **not** copied here: they come from `sample-courses/` (see its README; OpenStax,
  CC BY / CC BY-NC-SA 4.0).
