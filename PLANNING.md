# CV Generation Plan (AwesomeCV)

## Scope

Add CV generation alongside cover letters using the awesomecv-jinja template, with strict input validation and sandboxed PDF compilation. The backend will stream the PDF bytes to the client so end users do not interact with server file permissions.

## Decisions

- Use awesomecv-jinja as the initial template provider (single template option).
- Treat all end-user input as untrusted.
- LLM outputs JSON only; validated fields are passed to the renderer.
- Compile with local `xelatex` under a sandbox user.
- Stream PDFs via `POST /cv` instead of writing to user-writable paths.

## Backend Plan

1. Add `CvRequest` in [backend/app/schemas/search.py](backend/app/schemas/search.py) with:
   - `resume_text`, `job_title`, `company`, `job_description`, `job_url`, `model`
   - `template_id` (default `awesomecv`)
   - `doc_type` (default `resume`)
2. Add `POST /cv` in [backend/app/main.py](backend/app/main.py) that returns `application/pdf` with a `Content-Disposition` filename.
3. Implement [backend/app/services/cv_service.py](backend/app/services/cv_service.py):
   - Build strict JSON prompt for AwesomeCV fields.
   - Validate with Pydantic models and reject unknown fields.
   - Sanitize strings (strip LaTeX control characters) before rendering.
   - Render with awesomecv-jinja into a temp dir (`CV_TMP_DIR`, default `/tmp/job-agent-tex`).
   - Read PDF bytes and return to the API layer.

## Frontend Plan

1. Add `generateCv()` to [frontend/src/api/llm.js](frontend/src/api/llm.js) that returns a PDF blob and filename.
2. Add a CV section in [frontend/src/components/JobModal.jsx](frontend/src/components/JobModal.jsx):
   - Template selector (single option for now).
   - "Generate CV (PDF)" button.
   - Trigger download from the returned blob.

## README Updates

Add a "CV Generation Setup (macOS)" section to [README.md](README.md):

- Install `xelatex` via `mactex-no-gui`.
- Add `/Library/TeX/texbin` to `PATH`.
- Create the `latex_sandbox` user.
- Create `/tmp/job-agent-tex` with strict permissions.
- Install `awesomecv-jinja` in the repo virtualenv.
- Smoke test to produce `resume.pdf`.
- Note that PDF bytes are streamed to the client, so end users do not need server file access.

## Verification

- `POST /cv` returns `200` with non-zero PDF size.
- PDF opens in the browser and downloads with the suggested filename.
- LaTeX injection attempts are neutralized.
- Cover letter generation remains unchanged.
