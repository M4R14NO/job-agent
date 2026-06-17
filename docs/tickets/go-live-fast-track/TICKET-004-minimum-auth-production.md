# Ticket 004: Implement Minimum Authentication for Production

## Context
Repository is currently local-first and no-auth in documented limitations.

## Proposed MVP Auth Architecture (Recommended)

Goal: Keep implementation simple, provider-agnostic, and production-safe for first go-live.

### Core Decisions
- Use app-managed session auth (not provider-native IAM).
- Use one login endpoint with username and password.
- Store server-side session state in signed token cookie (httpOnly, Secure, SameSite=Lax) with short expiry.
- Protect sensitive API routes via shared backend auth dependency.
- Start with single-admin account from environment variables for MVP.
- Add logout and explicit session expiry handling.

### Why This Fits Current Constraints
- Works the same on Hostinger VPS or Hetzner VPS.
- No lock-in to hosting provider identity products.
- Low implementation complexity for first production release.
- Can be upgraded later to multi-user auth or external identity provider.

### Security Baseline
- Password is stored as Argon2 hash in environment variable (never plaintext in repo).
- Session token signed with dedicated secret key from secure runtime secret storage.
- Session max age: 8 hours (configurable).
- Failed login rate limit (for example 5 per minute per IP).
- CSRF risk reduced via SameSite cookie and POST-only login/logout.

### API Surface (MVP)
- POST /auth/login
	- Body: username, password
	- Success: set session cookie, return 200 with user summary
	- Failure: 401
- POST /auth/logout
	- Clears session cookie
- GET /auth/me
	- Returns authenticated user info or 401

### Protected Routes (Minimum)
- Protect CV profile CRUD endpoints.
- Protect CV generation/adaptation endpoints.
- Keep health endpoint public.

### Frontend Behavior (MVP)
- Add simple login page/modal before protected flows.
- On app load, call GET /auth/me to determine session state.
- On 401 from protected APIs: redirect to login and show short message.
- Add logout action in main UI.

### Environment Variables
- AUTH_ENABLED=true
- AUTH_ADMIN_USERNAME=<value>
- AUTH_ADMIN_PASSWORD_HASH=<argon2-hash>
- AUTH_SESSION_SECRET=<strong-random-secret>
- AUTH_SESSION_MAX_AGE_SECONDS=28800

### Implementation Plan
1. Backend auth module: password verify, token sign/verify, auth dependency.
2. Auth routes: login, logout, me.
3. Apply auth dependency to sensitive routers.
4. Frontend: login form, auth bootstrap, 401 handling, logout.
5. Tests: allow and deny paths, expiry, logout, cookie flags.

### Future Upgrade Path (Post Go-Live)
- Replace single-admin account with user table.
- Add password reset and optional MFA.
- Optionally integrate external identity provider (OIDC).
- Add refresh-token rotation if longer sessions are needed.

## Goal
Introduce minimum viable auth for production access control.

## Scope
- Backend auth middleware or dependency.
- Frontend login/session handling.
- Route protection for sensitive endpoints.

## Tasks
- Select implementation approach (simple JWT session or provider integration).
- Protect CV profile CRUD and generation endpoints.
- Add frontend login flow and token/session storage strategy.
- Add auth tests for allow/deny behavior.

## Ticket-004 Implementation Decision
- Chosen approach for go-live: app-managed signed session cookie with single-admin credentials from secure environment secrets.
- Reason: fastest safe path, hosting-provider independent, minimal operational complexity.

## Definition of Done
- Unauthenticated requests to protected endpoints are denied.
- Authenticated user can complete main flow.
- Basic session expiry/logout behavior works.

## Acceptance Criteria
- Security review signs off on minimum auth controls.
- Manual verification confirms:
	- Unauthenticated access to protected endpoints returns 401.
	- Login creates cookie with httpOnly, Secure, SameSite=Lax.
	- Logout invalidates session.
	- Session expires according to configured max age.

## Priority
P0
