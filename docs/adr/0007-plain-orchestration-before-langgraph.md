# ADR 0007: Plain Python orchestration for Phase 3 (no LangGraph yet)

- **Status:** Proposed — interim answer to open decision #4
- **Date:** 2026-11-07

## Context

Phase 3 workflows are linear: retrieve → generate → validate → persist as draft. There are no
loops, branches, tool calls or long-lived agent state.

## Decision

Implement each workflow as a job handler in `app/modules/ai_engine/workflows.py` on top of the
generic job runner (ADR 0002). Prompts are versioned in `prompts.py`; every output is stored in
`ai_output_versions` with prompt id/version, provider and model; usage in `ai_usage_records`.

### Safety pipeline (design §6.4)

1. Retrieved document text is wrapped in delimited `<excerpt>` blocks marked as untrusted data;
   delimiter tags inside document text are neutralised.
2. The model fills a simple Pydantic schema (structured output).
3. `validation.py` removes source references to pages that were not provided, rejects output with
   no valid references (`UNGROUNDED_OUTPUT`), clips to limits and re-validates against the strict
   domain contract (`LessonContent`).
4. Results are saved as drafts (outline proposals need explicit apply; AI lessons are unpublished;
   section regeneration creates a new version and refuses if the lesson changed meanwhile).

### Retrieval (no embeddings yet)

Chapter page ranges first; lexical overlap fallback. pgvector + `EmbeddingProvider` can replace the
fallback later without changing handlers.

## Revisit when

Workflows need branching, multi-step tool use, human-in-the-loop pauses inside one run, or
3D scene/animation planning chains (Phases 5–6).
