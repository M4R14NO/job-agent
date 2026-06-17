# Ticket 019: Decide LLM Tracing Stack (Langfuse + vLLM)

## Goal
Confirm Langfuse + vLLM as the approved self-hosted tracing stack with a fast go/no-go check (no broad tool research).

## Scope
- Quick technical validation note.
- Privacy model for per-person usage attribution.
- Integration fit for current FastAPI + service architecture.

## Tasks
- Evaluate Langfuse with vLLM integration path based on official integration guide.
- Record explicit go/no-go decision and key caveats.
- Define required tracked fields: user identifier, request id, model, tokens, latency, error, endpoint/workflow.
- Define pseudonymization strategy for user attribution (stable salted hash, no raw username in traces).
- Define data retention baseline and access model for tracing data.
- Produce concise implementation prerequisites for Ticket-020.

## Definition of Done
- Decision record approved by Backend + DevOps + Product.
- Langfuse + vLLM decision and privacy model are documented.
- Implementation prerequisites for Ticket-020 are explicit.

## Acceptance Criteria
- A short decision note exists with go/no-go and rationale.
- Langfuse + vLLM feasibility is confirmed or rejected with key caveats.

## Dependencies
- TICKET-004-minimum-auth-production.md
- TICKET-017-data-inventory-and-vvt-reduced-scope.md
- TICKET-018-retention-policy-definition-profiles-images-logs.md

## Priority
P1
