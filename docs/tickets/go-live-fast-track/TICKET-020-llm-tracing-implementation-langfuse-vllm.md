# Ticket 020: Implement LLM Tracing (Langfuse + vLLM)

## Goal
Implement self-hosted LLM tracing with Langfuse + vLLM integration for per-person usage monitoring and operational visibility.

## Scope
- Backend instrumentation of LLM calls.
- Self-hosted Langfuse deployment path (staging first).
- CI/CD and validation hooks for tracing health.

## Tasks
- Add Langfuse SDK instrumentation at LLM call chokepoints.
- Propagate request/user context from API handlers to LLM service invocations.
- Apply pseudonymized user identifier in trace metadata.
- Capture model, token usage, latency, outcome status, and workflow metadata.
- Deploy Langfuse in staging and connect backend securely.
- Add tracing smoke checks and failure handling in CI/CD.
- Document operational runbook (keys/rotation, retention, backup, incident handling).

## Definition of Done
- Staging traces show end-to-end workflow spans with pseudonymized user attribution.
- Langfuse service is reachable, monitored, and documented.
- Rollback path exists for tracing failures without impacting core API flows.

## Acceptance Criteria
- At least one CV flow and one search/rerank flow emit traces in staging.
- Usage can be segmented by pseudonymized user id.
- No raw usernames are stored in tracing payloads.

## Dependencies
- TICKET-019-llm-tracing-decision-langfuse-vllm.md (quick go/no-go confirmation)
- TICKET-007-dockerize-frontend-backend-nonroot.md
- TICKET-008-minimum-ci-pipeline.md
- TICKET-009-staging-cd-and-manual-prod-release.md

## Priority
P1
