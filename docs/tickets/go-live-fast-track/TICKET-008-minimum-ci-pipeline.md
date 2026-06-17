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

## Status
Erledigt

## Implementation Notes (Current)

- Workflow files:
	- `.github/workflows/ci.yml` (Core Build/Test)
	- `.github/workflows/ticket005-security-validation.yml` (Ticket-005 Security Validation)
- Trigger:
	- Core CI: `pull_request`, `push` on `main`, `workflow_dispatch`
	- Ticket-005 Security Validation: `workflow_dispatch` plus path-based Trigger auf `pull_request`/`push`
- Jobs:
	- `backend-tests`
	- `frontend-build-and-test`
	- `llm-tracing-validation-placeholder`
	- `ticket005-security-validation` (separater Workflow)

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

## Evidence (Current)
- PRs und Pushes triggern CI automatisch.
- Build/Test-Gates blockieren bei Fehlern.
- Ticket-005 Security-Stage laeuft erfolgreich und erzeugt Nachweisartefakte.
- Erfolgreicher Nachweislauf dokumentiert in `docs/tickets/go-live-fast-track/README.md` unter "CI Evidence (Ticket-005/008)".

## Follow-up Optimization
- Optionaler naechster Schritt zur weiteren Minutes-Optimierung:
	- Path-Filter des Ticket-005-Workflows bei Bedarf weiter verfeinern,
	- oder Security-Validierung zusaetzlich nur fuer Release-Branches/Tags ausfuehren.
