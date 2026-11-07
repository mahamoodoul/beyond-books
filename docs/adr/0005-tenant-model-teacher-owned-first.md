# ADR 0005: Teacher-owned courses first, school ownership supported in the schema

- **Status:** Proposed — interim answer to open decision #2 (tenant model)
- **Date:** 2026-11-07

## Decision

- `users.account_type` is `teacher` or `student` (global capability).
- Schools and memberships exist (`school_admin`, `teacher`, `student`) and classrooms belong to a school.
- `courses.school_id` is nullable. A course with no school is owned by its creating teacher; a course
  with a school is additionally manageable by that school's admins.
- Roles and permissions are defined in code (`app/core/authz.py`) rather than the `roles` /
  `permissions` tables in design §8.2. Add tables when roles become configurable per school.
- Authorization helpers return 404 when the caller may not know a resource exists, 403 when they
  can see it but not act on it.

## Consequences

Either final answer to decision #2 fits this schema. Requiring schools later means making
`courses.school_id` NOT NULL after a data migration.
