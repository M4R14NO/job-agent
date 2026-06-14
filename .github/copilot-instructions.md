# job-agent Repository Instructions

## Scope
- Keep frontend workflow changes consistent across both CV creation entry points:
	- Standalone Create CV flow.
	- Job-detail W1 CV flow.

## Current Workflow Architecture (Source of Truth)
- Shared step wizard: `frontend/src/components/cvNewbie/CvDraftWizard.jsx`.
- Shared step UI shell: `frontend/src/components/cvNewbie/CvNewbieFlow.jsx`.
- W1 orchestration view: `frontend/src/components/workflows/JobSearchCreateCvWorkflowView.jsx`.
- App composition/wiring entry point: `frontend/src/App.jsx`.
- Shared preview/autosave controller: `frontend/src/hooks/useCreateCvWorkflowController.js`.
- Detailed domain ownership map: `docs/frontend-workflow-ownership-map.md`.

## W1 CV State-Machine Contract
Canonical states are: choice, create, branch, branch-review.
Transition rules must be centralized in the workflow module. 
No duplicate ad-hoc state transitions in UI components.
Primary owner is `useW1CvWorkflowStateMachine` and invariants are defined in `w1CvWorkflowContract`.
### Required invariants:
branch-review opens the shared wizard at step 5 (review).
entering branch-review never auto-runs adaptation.
branch review CTA label is exactly Adapt CV to new job.

## Cross-Flow Parity Contract
Standalone Create CV and W1 create and branch-review must reuse the same wizard chain and step-header actions.
Any step UX change in one path must be applied to the other unless explicitly documented as an intentional divergence.
### Preview and Autosave Contract
Create workflows use manual preview updates.
Non-create review workflows may use auto or debounced preview.
Autosave cadence is 20 seconds and also runs on step leave.
Pending preview badge increments only after successful autosave.
### Guardrails
Do not bind workflow behavior to file location (for example only in App).
Implement behavior in shared domain modules and consume through explicit APIs.

## Refactor Navigation Guide
- Use `docs/frontend-workflow-ownership-map.md` as the canonical module ownership and debug-entry reference.

## Validation Before Finishing
- Frontend: `cd frontend && npm run build`.
- If workflow behavior changed, verify both:
	- Standalone Create CV.
	- W1 Job-detail CV path (including branch-review).
