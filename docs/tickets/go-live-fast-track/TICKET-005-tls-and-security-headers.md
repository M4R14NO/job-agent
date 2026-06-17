# Ticket 005: Enforce TLS and Security Headers

## Context
Production traffic must be protected in transit and hardened at edge.

## Goal
Enforce HTTPS and baseline security headers for frontend and backend.

## Scope
- Caddy edge config (TLS termination + reverse proxy).
- Header strategy for edge and API responses.
- CORS restriction via deployment-time allowlist.

## Tasks
- Replace Nginx assumption with Caddy as canonical edge/TLS layer.
- Configure HTTP -> HTTPS redirects in Caddy.
- Configure Caddy reverse proxy for frontend and backend endpoints.
- Set baseline headers: HSTS, X-Content-Type-Options, Referrer-Policy, CSP baseline.
- Implement backend env-based CORS allowlist (no hardcoded prod origins).
- Add deployment checklist item and validation script for redirect + header checks.

## Definition of Done
- HTTP requests are redirected to HTTPS.
- Headers are present and verified in staging.
- CORS is restricted to intended origins.
- Caddy edge config is deployed in staging and documented.

## Acceptance Criteria
- External check confirms TLS and expected security headers.
- Evidence includes Caddy config reference plus validation script output.

## Dependencies
- TICKET-007-dockerize-frontend-backend-nonroot.md (container runtime for edge/app services)
- TICKET-008-minimum-ci-pipeline.md (automated validation execution)
- TICKET-009-staging-cd-and-manual-prod-release.md (staging/prod rollout path)

## Priority
P0

## Status
Erledigt (CI Smoke-Nachweis erfolgreich)

## Implementation Summary
- Caddy als kanonischer Edge/TLS-Layer etabliert (Nginx-Annahme ersetzt).
- HTTP -> HTTPS Redirect im Caddy-Setup umgesetzt.
- Baseline Security-Header aktiv: HSTS, X-Content-Type-Options, Referrer-Policy, CSP.
- Backend CORS von hardcoded Origin auf environment-variable-basierte Allowlist umgestellt.
- Validierungsskript fuer Redirect/Header/CORS erstellt und in CI integriert.
- CI-Artefakte als Nachweis aktiviert (auch bei Fehlern uploadbar).

## Evidence
- Workflow: `.github/workflows/ticket005-security-validation.yml`
- Ticket-005 Stage: `ticket005-security-validation`
- Nachweisartefakte:
	- `ticket005-security-check.log`
	- `ticket005-result.txt` (Wert: `passed`)

## Follow-up (Ticket-009)
- Reale Domain-Validierung fuer Staging/Production (nicht localhost) bleibt Bestandteil von Ticket-009.
- Dort verifizieren:
	- Redirect- und Header-Checks gegen reale Hostnamen.
	- CORS-Allowlist gegen echte Frontend-Origin(s).
	- Rollback-Prozedur fuer Caddy-Konfigurationsaenderungen.
