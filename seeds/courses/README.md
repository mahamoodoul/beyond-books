# Shared course seed

The four sample courses (Biology, Chemistry, Mathematics, Physics) with everything built so far:
chapters, learning objectives, the extracted textbook text, lessons, quizzes, 3D scenes, the 3D
models they use (`files/`, Git LFS) and the saved AI prompts. Importing makes **no AI calls**.

## Load it (collaborators): one command

```bash
git pull
make seed-courses EMAIL=you@example.com PASSWORD=choose-a-password
```

That's it. It downloads the course PDFs and 3D models (Git LFS), updates the database, creates
the teacher account if it doesn't exist yet (password: 12+ characters), and loads the courses.
Then log in with that email and password and open **My courses**.

- Already have an account? Leave out `PASSWORD`.
- Running it again is safe: what is already there is skipped.
- Needs Git LFS once per computer: `brew install git-lfs && git lfs install`.

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
