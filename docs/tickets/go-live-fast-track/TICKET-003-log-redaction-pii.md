# Ticket 003: Remove PII from Logs

## Context
Current logging may include canonical CV payload in backend error paths.

## Goal
Ensure no CV raw content or personal data is written to logs.

## Scope
- Backend logging in services and API handlers.
- Error logging format and metadata.

## Tasks
- Audit logging statements for payload dumps.
- Replace payload logging with safe metadata (request id, profile id, error class).
- Add helper for PII-safe structured logs.
- Add regression tests for critical error paths.

## Definition of Done
- No log line includes CV full text, email, phone, or profile image references unless explicitly masked.
- Tests confirm redaction behavior.

## Acceptance Criteria
- Triggering validation/runtime errors does not output raw payload content.

## Priority
P0
