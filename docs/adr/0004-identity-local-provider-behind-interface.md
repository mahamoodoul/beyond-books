# ADR 0004: Local identity provider behind an interface (interim)

- **Status:** Proposed — interim answer to open decision #1 (identity provider)
- **Date:** 2026-11-07

## Context

Phase 1 needs sign-in. The design asks for a managed provider such as Cognito "if regional, UX and
cost requirements fit" — not yet evaluated. Work must not stall on that decision.

## Decision

- `IdentityProvider` protocol (`backend/app/modules/authentication/identity.py`). The only
  implementation today is `LocalIdentityProvider`: argon2id hashes via `argon2-cffi`, no custom crypto.
- The app owns sessions regardless of provider: a short-lived JWT access token (15 min, HS256 via PyJWT)
  and an opaque refresh token (14 days) stored only as a SHA-256 hash in `auth_sessions`.
- Both tokens are `HttpOnly; SameSite=Lax` cookies (`Secure` required outside local/dev). Refresh token
  cookie is scoped to `/api/v1/auth`.
- Refresh tokens rotate on every use; reuse of a revoked token revokes all of the user's sessions.
- Access tokens are checked against their session on every request, so logout is immediate.
- CSRF: state-changing cookie-authenticated requests must send `X-Requested-With: edu3d`.
- Login is rate-limited per IP+email and per IP (in-process; move to Redis before scaling out).
- Registration is open (`EDU3D_OPEN_REGISTRATION`) for teachers and students; no self-registration as
  school admin. Students should move to invitation-only before a real school pilot.

## Not yet done

Email verification, password reset, MFA/SSO, invitation flow. These are required before a school pilot.

## Consequences

Switching to Cognito means a new `IdentityProvider` that verifies the IdP's tokens and maps
`identity_subject` → `users.id`; route-level code is unaffected.
