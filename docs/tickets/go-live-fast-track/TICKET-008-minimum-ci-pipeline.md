# Ticket 008: Set Up Minimum CI Pipeline

## Goal
Create a baseline CI workflow for build and test gates.

## Scope
- GitHub Actions workflow(s).
- Frontend build/test and backend tests.
- Security validation jobs for Caddy/TLS/header checks.

## Tasks
- Add workflow for frontend build and tests.
- Add workflow for backend test execution.
- Fail pipeline on test/build failures.
- Add status badge or docs reference.
- Add a Ticket-005 validation stage (security headers + redirect checks in staging smoke step).
- Define artifact upload for validation logs (for go-live evidence).
- Add placeholder job for future LLM tracing validation (Tickets 019/020).

## Definition of Done
- PRs trigger CI automatically.
- Failing tests/build block merge.
- Ticket-005 security checks are runnable from CI and produce artifacts.

## Priority
P0

## Implementation Notes (Current)

- Workflow file: `.github/workflows/ci.yml`
- Trigger: `pull_request`, `push` on `main`, and `workflow_dispatch`
- Jobs:
	- `backend-tests`
	- `frontend-build-and-test`
	- `ticket005-security-validation`
	- `llm-tracing-validation-placeholder`

### Ticket-005 Stage

- Runner script: `scripts/ci/run-ticket005-security-check.sh`
- Validation script: `scripts/validate-security-headers.sh`
- Artifact output path: `artifacts/ticket005`
- Artifact name: `ticket005-security-validation`
- Inputs/secrets:
	- `staging_url` / `STAGING_URL`
	- `allowed_origin` / `ALLOWED_ORIGIN`
	- `disallowed_origin` (default `https://evil.example.com`)

### LLM Tracing Placeholder

- Artifact output path: `artifacts/llm-tracing`
- Artifact name: `llm-tracing-placeholder`
- Purpose: keep CI surface ready for Tickets 019/020 validation logic.
