---
description: "Use when: editing frontend code under frontend/**. Provides minimal rules for safe, modular changes."
applyTo: "frontend/**"
---

# Frontend Change Rules (Minimal)

## Keep ownership clear
- Treat `frontend/src/App.jsx` as composition/wiring.
- Put domain logic in hooks/workflow modules, not inline in views.
- Prefer updating existing domain owners before adding new logic paths.

Current key owners:
- W1 transitions: `frontend/src/hooks/useW1CvWorkflowStateMachine.js`
- W1 contract/invariants: `frontend/src/workflow/contracts/w1CvWorkflowContract.js`
- Search/rerank/cache + search inputs: `frontend/src/hooks/useSearchWorkflowController.js`
- Search merge helpers: `frontend/src/workflow/search/searchMappers.js`
- Profile list + bulk ops: `frontend/src/hooks/useCvProfilesController.js`
- Profile helpers: `frontend/src/workflow/profiles/*.js`
- Preview/autosave orchestration: `frontend/src/hooks/useCreateCvWorkflowController.js`

## Preserve workflow contracts
- Keep parity between standalone Create CV and W1 create/branch-review flows when changing workflow behavior.
- For exact W1 state/invariant rules, use the canonical sources:
  - `frontend/src/workflow/contracts/w1CvWorkflowContract.js`
  - `.github/instructions/information-architecture.instructions.md`

## Keep interfaces stable unless required
- Avoid broad prop-surface churn in shared components.
- If behavior changes, update docs in `docs/**` in the same change set.

## Validation
- Always run: `cd frontend && npm run build`
- If workflow behavior changed, smoke-check:
  - standalone Create CV flow
  - W1 job-detail CV flow (including branch-review)
