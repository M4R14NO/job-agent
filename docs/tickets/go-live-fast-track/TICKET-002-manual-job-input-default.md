# Ticket 002: Make Manual Job Input the Default Flow

## Context
Go-live should rely on user-provided job context (URL or pasted text) instead of scraping.

## Goal
Set manual job input as the default and primary UX path in production.

## Scope
- Frontend entry flow and form defaults.
- Optional manual job context input (URL/text) without mandatory validation rules.
- User messaging.

## Tasks
- Add/confirm a dedicated manual job input path (job URL and job text).
- Set this path as default in production mode.
- Add UI copy that explains accepted formats.
- Add frontend tests for primary manual flow.

## Definition of Done
- Users can complete core workflow via manual input only.
- No scraping action is required in the main user path.
- Tests cover URL-only and text-only while keeping job context optional.

## Acceptance Criteria
- New user can go from job context input to CV output without scraping.
- Manual flow is visible and first-class in UI.

## Priority
P0
