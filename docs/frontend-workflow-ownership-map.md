# Frontend Workflow Ownership Map

Date: 2026-06-14
Status: Current source-of-truth map for refactored frontend domains.

## Why this file exists
This map helps future agents quickly locate ownership after the W1/search/profile refactor work.

It reflects:
- Recent committed refactors (W1 state machine, workflow contract, search controller, search mappers).
- New utility split in profile domain (id, context, payload helpers).

## Composition root
- `frontend/src/App.jsx`
  - Role: composition and wiring across domains.
  - Should not become the primary home of domain transition rules or payload builder logic.

## W1 CV workflow domain
- `frontend/src/hooks/useW1CvWorkflowStateMachine.js`
  - Owns W1 transitions and semantic navigation handlers.
- `frontend/src/workflow/contracts/w1CvWorkflowContract.js`
  - Owns canonical states and invariant/transition helpers.
- `frontend/src/components/workflows/JobSearchCreateCvWorkflowView.jsx`
  - UI orchestration view consuming W1 domain outputs.

Canonical W1 states:
- `choice`, `create`, `branch`, `branch-review`, `review`

Required invariants:
- `branch-review` opens shared wizard at review step.
- Entering `branch-review` does not auto-run adaptation.
- Branch review CTA label is `Adapt CV to new job`.

## Search and rerank domain
- `frontend/src/hooks/useSearchWorkflowController.js`
  - Owns search input state, model selection, timeout, search lifecycle, rerank, and cache.
- `frontend/src/workflow/search/searchMappers.js`
  - Owns merge utilities and transient LinkedIn enrichment failure handling.

## Create-flow preview/autosave domain
- `frontend/src/hooks/useCreateCvWorkflowController.js`
  - Owns preview orchestration and autosave policy behavior.

## Profile domain
- `frontend/src/hooks/useCvProfilesController.js`
  - Owns profile list refresh and bulk operations (delete/import/export).

- `frontend/src/workflow/profiles/profileIdUtils.js`
  - Owns profile id normalization, suggestion, versioning, company suffix, and draft id generation.

- `frontend/src/workflow/profiles/profileContextUtils.js`
  - Owns profile context mapping/snapshot and context diff/match helpers.

- `frontend/src/workflow/profiles/profilePayloadUtils.js`
  - Owns payload and lineage builders for create/update/remap/draft/save flows.

## Where to debug by symptom
- W1 step or transition bug:
  - `useW1CvWorkflowStateMachine.js`
  - `w1CvWorkflowContract.js`

- Search/rerank/cache behavior issue:
  - `useSearchWorkflowController.js`
  - `searchMappers.js`

- Profile naming/versioning issue:
  - `profileIdUtils.js`

- Profile context mismatch/diff issue:
  - `profileContextUtils.js`

- Profile save/remap payload shape issue:
  - `profilePayloadUtils.js`

## Guardrails for future refactors
- Keep transition rules in domain modules/hooks, not scattered in view components.
- Keep payload-assembly logic in profile workflow utilities.
- Keep cross-flow parity between standalone Create CV and W1 create/branch-review flows.
- If ownership moves again, update this file and instruction files in the same change set.
