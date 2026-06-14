# Go-Live Refactor Plan (2026-06-04)

This plan focuses on two streamlined user journeys (newbie and power user), reduces cognitive load in the UI, and improves backend and frontend maintainability. It adds backend-focused tests, a minimal CI/CD pipeline for Docker deployments, and a DSGVO-compliant auth solution with minimal user data.

## Goals
- Improve end-user workflows with clear, guided steps and less visual noise.
- Make code maintainable by splitting large files into modules and adding tests for critical backend flows.
- Enable fast, reliable deployments with CI/CD.
- Add DSGVO-compliant authentication using a vetted, open-source provider.

## Scope and Assumptions
- In-scope: two workflow modes, PDF preview control, backend refactor, backend tests, CI/CD, authentication.
- Out-of-scope: frontend automated tests and full PDF upload workflow (future work).
- Hosting target: VPS (Hetzner/Hostinger) with Docker; CI/CD via GitHub Actions.
- LLM will likely run on a separate server (vLLM) later; do not block go-live.

## Workstreams and Steps

### 1) Information Architecture and Entry Model
- Define the shared entry points: job search, create CV, create cover letter.
- For each entry, outline the step-by-step path for newbie and power user.
- Finalize the minimum UI components shown to newbies (no CV profile tables, no application context section).

### 2) Frontend Workflow Refactor (Newbie)
- Build a multi-step flow with distinct views:
  1. Template gallery (with PDF preview images)
  2. Language selection
  3. CV input (paste CV text; upload placeholder as disabled future option)
  4. Optional job description (only if not using job search)
  5. Review step with explicit "Update preview" action
- Ensure no page jumping and remove always-on scrolling to different sections.
- PDF preview updates only on explicit action (button), not on every edit.

### 3) Frontend Workflow Refactor (Power User)
- Add a visible entry to "Advanced / Power user mode".
- Keep CV profile management and branching while improving copy and labels.
- Reuse the same step-by-step structure as the newbie flow.
- Reduce application context complexity and space usage.

### 4) Backend Refactor for Maintainability
- Split [backend/app/main.py] into routers by domain: search, CV, cover letter, admin.
- Split long services by responsibility:
  - ranking: prompt prep vs scoring vs fusion
  - CV: parsing vs rendering vs PDF guard
- Keep existing request/response contracts intact.

### 5) Automated Tests (Backend Only)
- Add or extend tests for:
  - Search flow (fetch, normalize, rerank)
  - CV parse and render (including PDF guard)
  - CV profile storage integrity
- Use fixtures/mocks to avoid reliance on a live LLM.

### 6) CI/CD Pipeline
- Add GitHub Actions workflow:
  - Lint/test backend
  - Build frontend
  - Build Docker images and push to registry
  - Deploy to VPS via SSH or pull-and-compose
- Define secrets handling, environment variables, and rollback strategy.

### 7) Authentication (DSGVO Compliant)
- Evaluate and pick one:
  - Authentik (lightweight, open-source, good UX)
  - Keycloak (mature, heavier)
  - Managed EU-based provider (fastest if budget allows)
- Implement minimal user profile storage and data deletion flows.
- Ensure hosting region and data processing agreements align with DSGVO.

### 8) Documentation and Go-Live Checklist
- Update README with workflows, ops, environment variables, and deployment steps.
- Add a brief user guide for newbie and power user flows.

## Verification
1. Run backend tests with pytest and ensure coverage of search, CV parsing, and profile storage.
2. Build frontend and smoke-test newbie and power user flows manually.
3. Run GitHub Actions on a branch to validate CI/CD.
4. Deploy to staging VPS and validate auth, CV generation, and job search.

## Progress Update (2026-06-05)

### Completed
- Information architecture file created with entry points and newbie/power-user paths.
- Newbie step flow implemented (template → language → CV text → job context → review).
- App split into `CreateCvView` and `FindJobsView` with step state moved into `CreateCvView`.
- Profile image upload moved into the CV editor; added thumbnail preview + change/remove controls.
- Profile image serving added in backend (`GET /cv/profile-image/{image_name}`).
- Newbie review action gated on CV text changes; action moved to header next to Back.
- Newbie stepper and layout tightened to reduce vertical noise and align content.

### In Progress
- Newbie review step: progress bar + auto PDF render after first draft (recent updates; still validating UX).
- Stepper/card vertical alignment tweaks (fine-tuning spacing to fully eliminate perceived gaps).

### Not Started
- Power user flow refactor to match newbie step structure.
- Backend refactor into routers + CV service splits.
- Backend-only tests for CV render/guard, search, and profile storage.
- CI/CD pipeline and DSGVO-compliant auth.

## Open Decisions
- Auth provider selection (Keycloak vs Authentik vs managed).
- VPS setup details (single server vs split LLM server).
- Data retention policy (how long to keep CV data and job data).
