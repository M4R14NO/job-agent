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
