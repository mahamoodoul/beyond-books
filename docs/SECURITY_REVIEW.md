# Security review (Phase 10 threat-model pass)

Scope: design §12 threat model against the implemented system. Status reflects automated tests
in `backend/tests/` unless marked *manual*.

| Threat / requirement | Control | Evidence |
|---|---|---|
| Cross-school / cross-teacher access (IDOR) | Central course/chapter/scene/asset access functions; 404 for unknown-to-caller | `test_idor_sweep.py` calls **every** path-param route as an unrelated teacher and student with valid bodies — 0 successes |
| Student reading another student's work | Attempts/answers/insights scoped to owner | `test_assessments.py`, `test_analytics.py` |
| Answer keys leaking before submission | Student schemas omit correctness/rubrics | `test_student_never_sees_answer_keys_before_submission` |
| Unpublished content access | Published snapshots for lessons/scenes/assessments | lesson, scene, assessment tests |
| Forged asset IDs / URLs in scene JSON | `extra="forbid"`, slug refs resolved server-side, approved+usable checks | `test_three_d.py`, contract tests |
| Malicious GLB | No external/data URIs, extension allowlist, budgets | `test_glb.py` |
| Malformed / oversized PDFs, spoofed types | Size limits, signature sniffing, page limit, worker-only parsing | `test_documents.py` |
| Expired/forged signed URLs | Signed short-lived tokens | storage token tests |
| Prompt injection (documents, student answers) | Untrusted delimited blocks, tag neutralisation, schema-validated output, human review gates | `test_ai_validation.py`, `test_prompt_injection_in_answer_does_not_bypass_review` |
| Hallucinated content | Source refs restricted to provided pages; ungrounded output rejected; teacher publish gate | AI tests |
| Incorrect AI grading | Advisory only, teacher accept/override, audited | assessment tests, ADR 0011 |
| Session theft / CSRF | HttpOnly SameSite cookies, rotation + reuse detection, CSRF header | `test_auth.py` |
| Brute force / abuse | Login limiter, per-IP API limiter, AI/3D/explain daily caps | auth + hardening tests |
| Secret leakage | No secrets in responses/logs; access log has no query strings/bodies; prod config guards | `test_hardening.py` |
| Clickjacking, MIME sniffing, XSS | CSP (API + SPA), `X-Frame-Options: DENY`, `nosniff`; Markdown rendered with HTML skipped | headers test; *manual* SPA CSP check |
| Data subject rights | Export + deletion (cascade), audited | `test_export_my_data`, `test_delete_account` |

## Open items before a real school pilot (not done)

- Email verification, password reset, invitation-only student accounts, MFA for staff (ADR 0004).
- Malware scanning of uploads (e.g. S3 + scanner) — currently signature checks only.
- Distributed rate limiting (Redis) before running more than one API replica.
- PostgreSQL row-level security as defence in depth (design §8.6) — not yet enabled.
- DPIA, data processing agreements, retention periods and age-appropriate notices with qualified
  Norwegian/EU privacy advisers (open decision #9). **Do not onboard real students before this.**
- Penetration test of the deployed staging environment.
