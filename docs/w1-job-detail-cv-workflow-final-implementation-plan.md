# W1 Job-Detail CV Workflow: Final Implementation Plan

Date: 2026-05-27
Status: Finalized for implementation in a follow-up chat
Scope: Frontend workflow and UX behavior for W1 (Find Job -> Job Detail -> Generate CV)

## 1. Goal

Unify W1 behavior with safe profile handling and clear user intent:

- Keep the user inside W1 (job detail context) for CV browsing, tailoring, and editing.
- Make it explicit what Tailor is targeting (source profile, target job, target profile id).
- Prevent accidental overwrites of existing profiles.
- Preserve predictable progression from read-only browsing to editable drafting.

## 2. Core UX Rules

1. Do not silently mutate an existing loaded profile when working against a different job.
2. If user chooses to edit from a loaded profile in W1, auto-create and persist a new draft profile copy first.
3. Any potentially destructive overwrite path must require explicit user confirmation.
4. In W1, keep profile browsing (datatable) available while review/preview is visible.

## 3. W1 State Model

State S1: no formData, no CV text
- FormData available: no
- CV text available: no
- CV editor/review visible: no
- PDF preview visible: no
- Tailor button: hidden
- Edit button: hidden
- Required UI guidance: show explicit next steps (load/browse a profile or paste CV text in application context)

State S2: no formData, CV text exists
- FormData available: no
- CV text available: yes
- CV editor/review visible: no
- PDF preview visible: no
- Tailor button: visible
- Edit button: hidden
- Tailor behavior: creates job-tailored profile from CV text path

State S3: browsed profile with formData, but no CV text
- FormData available: yes
- CV text available: no
- CV editor/review visible: yes (read-only)
- PDF preview visible: yes (read-only)
- Tailor button: hidden
- Edit button: visible
- Required UI guidance: explain CV text is needed to enable Tailor

State S4: browsed profile with formData and CV text
- FormData available: yes
- CV text available: yes
- CV editor/review visible: yes (read-only)
- PDF preview visible: yes (read-only)
- Tailor button: visible
- Edit button: visible
- Tailor behavior: create new editable job-tailored copy

## 4. Profile Datatable Behavior in W1

1. Datatable remains present in W1 even when CV review card is open.
2. It is wrapped in a collapsible section, collapsed by default.
3. No Create New button in W1 datatable header.
4. Row selection is side-effect safe:
- Loads selected profile into read-only review/preview context.
- Does not overwrite existing profile data.
- Does not auto-save changes.

## 5. Tailor Context Clarity (Always Visible Near Tailor Action)

Show a compact Tailor context panel with:

- Target job: job title + company
- Source profile: currently browsed profile id
- Target profile: suggested resulting profile id
- Template + output language

Primary copy:
- "Create an editable, job-tailored copy for [Job Title] at [Company]."

## 6. Read-Only Review Actions

When read-only review is shown (S3/S4), display two actions:

1. Tailor action
- Label: "Tailor & create editable copy"
- Visible only when CV text exists.
- During execution, show spinner + progress bar + elapsed/timeout text.

2. Edit action
- Label: "Edit profile"
- Opens a decision modal with two choices:
  - "Create new draft for this job" (recommended)
  - "Continue with loaded profile" (guarded path; see section 7)

## 7. Editing Strategy for Loaded Profile (Safety-First)

If loaded profile job context differs from currently opened W1 job context:

- Do not edit the original directly.
- Automatically create and persist a new draft copy first.
- Populate this draft with:
  - All copied profile data from source profile
  - Updated job-specific fields from current job detail
- Open editor in editable mode on that new draft profile.

If job context matches and user explicitly chooses to continue with current profile:
- Allow editing current profile, but ask before any overwrite-conflicting save.

## 8. Draft Profile Naming Rules

New draft profile id format should clearly indicate in-progress work for a job-specific branch.

Suggested format:
- {base-profile}-{clean-company}-draft

Collision handling:
- If existing id matches, append version suffix:
  - {base-profile}-{clean-company}-draft-v2
  - {base-profile}-{clean-company}-draft-v3
  - etc.

Normalization:
- Reuse existing profile id sanitizer (lowercase, non-alphanumeric -> hyphen, trim hyphens).

## 9. Save/Overwrite Guardrails

1. Original source profile must never be overwritten without explicit user decision.
2. Any save that targets an existing id with conflicting content must trigger overwrite confirmation modal.
3. Default path should favor saving as new draft copy.

## 10. Visibility Rules Summary

1. If no formData and no CV text: no preview cards, no Tailor button, guidance only.
2. If no formData but CV text exists: no preview cards, Tailor visible.
3. If formData exists and CV text missing: read-only review/preview visible, Edit visible, Tailor hidden + guidance.
4. If formData and CV text exist: read-only review/preview visible, Tailor + Edit visible.

## 11. Implementation Work Packages

Package A: State and visibility orchestration (W1)
- Implement explicit W1 UI state derivation (S1-S4).
- Drive button/card visibility from state, not from implicit component mounting only.

Package B: Persistent W1 profile browser
- Keep W1 datatable mounted while review is open.
- Ensure collapsible behavior and default collapsed state.

Package C: Tailor context clarity
- Add source/target/job summary block in W1 action area and read-only banner context.

Package D: Edit decision flow
- Add modal for Edit action in read-only mode.
- Branch to draft auto-create path or guarded current-profile path.

Package E: Draft auto-create and naming
- Add helper(s) for draft id generation and collision-safe versioning.
- Auto-save draft copy when editing from mismatched job context.

Package F: Progress and feedback
- Keep/provide Tailor progress indicator in all visible Tailor entry points.
- Ensure busy/disabled states are obvious.

Package G: Regression checks
- Validate W1 S1-S4 behavior matrix.
- Validate W2 unchanged behavior.
- Validate build and key manual scenarios.

## 12. Acceptance Criteria

1. W1 never silently overwrites loaded profile when user starts job-specific editing.
2. W1 always makes Tailor target explicit (source profile, target job, target profile id).
3. Datatable is available in W1 during read-only review (collapsible, default closed).
4. Tailor is only visible when actionable (CV text exists), with clear progress feedback.
5. Edit from loaded profile in W1 creates and persists a clearly named draft copy by default.
6. Overwrite actions require explicit user confirmation.
7. W2 behavior remains functionally unchanged.

## 13. Out-of-Scope

1. Backend API contract changes.
2. Major visual redesign beyond required clarity and control placement.
3. Non-W1 workflow architecture changes unrelated to this behavior set.

## 14. Recommended First Implementation Sequence (Next Chat)

1. Implement W1 state matrix (S1-S4) and card/button visibility logic.
2. Keep W1 datatable mounted while review is visible.
3. Add Tailor context block and guidance messages.
4. Add Edit decision modal + draft auto-create path.
5. Add/finish draft naming and collision rules.
6. Run build + manual scenario checks against acceptance criteria.
