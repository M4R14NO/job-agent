---
description: "Use when: defining information architecture, entry points, and newbie/power-user workflows for job-agent. Includes step-by-step UI paths and manage-existing-CVs entry point."
applyTo:
  - "docs/**"
  - "frontend/**"
---

# Information Architecture (Go-Live Refactor)

## Entry Points (Shared)
1) Job search
2) Create CV
3) Create cover letter
4) Manage existing CVs (power users)

## Newbie vs Power User: High-Level Intent
- Newbie: guided, step-by-step views with minimal cognitive load; no dense tables or advanced settings visible by default.
- Power user: access to advanced controls, profiles, and branching while keeping the same step structure.

## Job Search: Step-by-Step Views (Newbie Priority)
Goal: Make the path visually easier with explicit steps and focused screens. Main changes are UI and flow guidance.

Steps:
1) Start search: term, location, remote toggle.
2) Optional refinement: job wishes + CV text (if using LLM), simple toggles only.
3) Review results: clear status/progress, simple filters only.
4) Select job: open detail with clear CTAs.

Power user additions:
- Advanced filters (time range, sites, results wanted).
- LLM rerank settings and model selection.
- Save/load preferences (later).

## Create CV: Step-by-Step Views
Newbie:
1) Template gallery (with preview image).
2) Language selection.
3) Paste CV text (upload disabled placeholder).
4) Optional job description (if not coming from job search).
5) Review with explicit "Update preview" action.

Power user additions:
- CV profile selection/branching.
- Section-level visibility toggles.
- Template details and advanced settings.

## Create Cover Letter: Step-by-Step Views
Newbie:
1) Select job (from search or paste description).
2) Paste resume text.
3) Generate and review.

Power user additions:
- Model selection.
- Saved prompts or reusable snippets.

## Manage Existing CVs (Power User Entry)
Purpose: Maintain and tailor saved CV profiles outside the newbie flow.

Core actions:
- Browse profiles.
- Open and edit.
- Duplicate/branch for a specific job.
- Delete with confirmation.

## Guidance Rules
- Step views should be explicit and linear; avoid scrolling the user between sections.
- Newbie views should hide advanced tables and dense controls.
- Power user mode should reuse the same step structure with expanded controls.
- PDF preview updates only on explicit action (no auto-refresh).
