---
description: "Use when: editing backend code under backend/**. Provides minimal rules for safe API/service changes."
applyTo: "backend/**"
---

# Backend Change Rules (Minimal)

## Preserve API contracts by default
- Keep request/response shapes stable unless explicitly changing contract.
- If a contract must change, update callers and docs in the same change set.

## Keep service boundaries clean
- Place endpoint wiring in `backend/app/main.py` (or router layer when present).
- Keep business logic in `backend/app/services/**`.
- Keep schema validation/types in `backend/app/schemas/**`.

## CV/profile safety rules
- Do not weaken overwrite/branch safety semantics.
- Keep profile lineage fields and revision behavior consistent.
- Preserve PDF guard behavior and safe rendering path.

## Search/ranking safety rules
- Prefer deterministic merge/normalization behavior.
- Handle transient upstream failures gracefully without crashing whole responses.

## Validation
- Run backend tests for touched areas: `cd backend && pytest`
- If CV/search behavior changed, run focused tests first, then full suite when feasible.
