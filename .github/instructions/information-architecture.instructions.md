---
description: "Use when: defining or updating job-agent information architecture, entry points, and CV workflow paths. Covers shared CvDraftWizard flows, W1 job-detail state machine, and manage-profiles entry point."
applyTo:
  - "docs/**"
  - "frontend/**"
---

# Information Architecture (Current)

## Primary Entry Points
1) Find a job
2) Create CV
3) Manage profiles

Notes:
- Cover-letter generation is a job-detail action (switchable from CV action), not a top-level rail entry.
- Manage profiles corresponds to advanced/power-user profile management.

## Newbie vs Power User Intent
- Newbie: guided step flow, minimal choices per screen, explicit navigation.
- Power user: profile browser, branching/remap operations, and review/editor controls.
- Prefer shared components over separate duplicated flows.

## CV Creation Architecture (Shared)
- Shared wizard chain (used in standalone and W1 create paths):
  1) Template
  2) Output language
  3) CV text
  4) Optional job context
  5) Review
- Canonical components:
  - `CvDraftWizard` for step orchestration and draft generation.
  - `CvNewbieFlow` for stepper/header/actions UX.
  - `useCreateCvWorkflowController` for preview/autosave orchestration.

## W1 Job-Detail CV Workflow
- Explicit state machine in `frontend/src/hooks/useW1CvWorkflowStateMachine.js` with contract in `frontend/src/workflow/contracts/w1CvWorkflowContract.js`:
  - `choice` -> choose create or branch
  - `create` -> shared step wizard from step 1
  - `branch` -> select source profile
  - `branch-review` -> shared wizard opened at step 5
- `branch-review` behavior:
  - Starts at step 5 directly.
  - Keeps adaptation optional and user-triggered.
  - Uses CTA label `Adapt CV to new job`.

## Preview and Autosave Rules
- Create workflows (standalone + W1 create/branch-review):
  - Manual preview update policy.
  - One-time preview render after draft generation.
- Autosave:
  - Interval: 20 seconds.
  - Also triggers on step leave.
  - Badge increments after successful autosave only.

## Manage Profiles (Power User Entry)
Purpose: maintain saved CVs outside the guided newbie-only path.

Code ownership reference:
- `docs/frontend-workflow-ownership-map.md` is the canonical module ownership map.

Core actions:
- Browse/search/select profile rows.
- Create new profile entry.
- Update profile CV text and application context.
- Branch/tailor for a specific job context.
- Bulk operations: delete, import, export.

## UI Guidance Rules
- Keep step state obvious with clear active-step emphasis.
- Keep guidance notes in header action row; avoid duplicate helper blocks in step body.
- Use minimal, consistent color semantics (avoid mixed competing highlight colors).
- On narrow screens, secondary step-3 example content should stack below CV text and scroll into focus when opened.

## Implementation Rules for Architecture Changes
- When editing flow behavior, update both:
  - Shared wizard path (standalone Create CV).
  - W1 job-detail path in `JobSearchCreateCvWorkflowView` + `useW1CvWorkflowStateMachine` transitions.
- Prefer extending shared flow components/hooks over adding parallel one-off logic.
- If a UX contract changes, update docs under `docs/**` in the same change set.

For exact domain ownership boundaries, use:
- `docs/frontend-workflow-ownership-map.md`

## Related Files
- `frontend/src/App.jsx`
- `frontend/src/components/workflows/JobSearchCreateCvWorkflowView.jsx`
- `frontend/src/components/cvNewbie/CvDraftWizard.jsx`
- `frontend/src/components/cvNewbie/CvNewbieFlow.jsx`
- `frontend/src/hooks/useCreateCvWorkflowController.js`
- `docs/frontend-workflow-ownership-map.md`
