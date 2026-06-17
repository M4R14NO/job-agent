# Ticket 011: User Data Export MVP

## Goal
Provide an MVP export of stored user profile data for data subject access.

## Scope
- Backend export endpoint or download action.
- Data packaging format.

## Tasks
- Define export schema (profile data + metadata).
- Implement endpoint to export by authenticated user/profile scope.
- Add basic audit logging for export event (without PII payload).
- Add tests for export correctness.

## Definition of Done
- User can retrieve complete stored profile dataset in machine-readable format.
- Export behavior documented for support/legal process.

## Priority
P1
