# Ticket 001: Disable Scraping in Production

## Context
The go-live decision path prioritizes a no-scraping production setup.

## Goal
Ensure scraping-based job acquisition and LinkedIn enrichment are disabled in production by default.

## Scope
- Backend runtime behavior for search/enrichment endpoints.
- Production configuration guardrails.
- Verification and documentation.

## Out of Scope
- Deleting scraping code entirely.
- Legal decision process.

## Tasks
- Add a production-safe feature flag for scraping and enrichment (default off).
- Gate scraping/enrichment endpoints and logic behind the flag.
- Return clear API error when disabled (for observability and client fallback).
- Add tests for disabled mode behavior.
- Document the environment variable and default behavior.

## Definition of Done
- In production config, scraping is disabled without code changes.
- Search flow does not trigger scraping/enrichment when disabled.
- Existing tests pass and new tests cover disabled behavior.
- README or ops docs include flag setup.

## Acceptance Criteria
- With flag off, scraping endpoints return deterministic disabled response.
- With flag on (non-production), current behavior remains available.

## Dependencies
- None.

## Priority
P0
