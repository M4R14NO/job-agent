# Job Agent Prototype

A local-first job search assistant with a FastAPI backend and a React/Vite frontend. It lets you search, normalize, and rerank job results, then generate a tailored cover letter from your resume text.

This repo is a public prototype. It focuses on local development and assumes you bring your own LLM endpoint (e.g. via LMStudio).

## What you can do

- Search job sources and view normalized results.
- Rerank results with an LLM to surface the best matches.
- Inspect match reasons and scores per job.
- Generate a cover letter for a selected job using your resume text.
- Cache and reuse the latest search response from the UI.

## Screenshots

- Search results (placeholder)
- Job details popup (placeholder)

## Run backend

1. Create a Python environment (3.10+).
2. Install dependencies:
   
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Start the API:

   ```bash
   uvicorn backend.app.main:app --reload --port 8000
   ```

## Run frontend

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```
2. Start the dev server:

   ```bash
   npm run dev
   ```

## Notes
- Backend health check: http://localhost:8000/health
- Frontend runs on http://localhost:5173
- Future refactoring ideas are tracked in [REFACTORING.md](REFACTORING.md)

## LMStudio Integration

The backend expects an OpenAI-compatible LMStudio server.

Environment variables (optional):

- `LMSTUDIO_BASE_URL` (default: `http://localhost:1234`)
- `LMSTUDIO_TIMEOUT` (default: `30` seconds)
- `LMSTUDIO_EMBEDDING_MODEL` (default: `text-embedding-3-small`)

The frontend fetches available models from `GET /models` and lets you select a chat model for reranking and cover letter generation.

## Search Contract

- Backend request and response schemas live in `backend/app/schemas/search.py`.
- Frontend request building and response normalization live in `frontend/src/api/searchSchema.js`.
- The UI should consume the normalized job shape from the frontend contract layer instead of reading fallback backend fields directly.

Canonical normalized job fields used by the UI:

- `title`
- `company`
- `description`
- `location`
- `site`
- `date_posted`
- `job_url`
- `match_score`
- `match_reasons`

## Rerank and Caching

- LLM rerank can be enabled with a user-selected top-K. If K is not set, the backend uses $K = \max(3, \lceil 0.4 \cdot N \rceil)$ capped by results wanted.
- The frontend stores the latest search response in session storage to avoid repeated searches. Use "Use cached results" or "Clear cache" in the UI.

## Cover Letter

- `POST /cover-letter` accepts resume text and the selected job details.
- The response is plain text and shown in the job modal.

## CV Generation (AwesomeCV)

The CV feature renders AwesomeCV templates via `awesomecv-jinja` and streams the PDF back to the browser. End users download the file directly, so server-side file permissions are not exposed to them.

CV profiles are stored locally under the CV temp directory (default: `/tmp/job-agent-tex/profiles/cv_profiles.json`). The CV editor lets users reorder sections, and that order is persisted per profile.

### macOS setup (local xelatex)

1. Install `xelatex`:

   ```bash
   brew install --cask mactex-no-gui
   ```

2. Add TeX binaries to your PATH (if needed):

   ```bash
   echo 'export PATH="/Library/TeX/texbin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. Create a sandbox user for compilation:

   ```bash
   sudo sysadminctl -addUser latex_sandbox -shell /usr/bin/false -home /var/empty
   ```

4. Create the sandbox temp directory:

   ```bash
   sudo install -d -m 700 -o latex_sandbox -g staff /tmp/job-agent-tex
   ```

5. Install `awesomecv-jinja` in the repo virtualenv:

   ```bash
   source .venv/bin/activate
   pip install awesomecv-jinja
   ```

### Smoke test (local)

Run the renderer under the sandbox user and write the PDF inside `/tmp/job-agent-tex`:

```bash
sudo -u latex_sandbox -H bash -lc 'cd /path/to/job-agent && source .venv/bin/activate && TMPDIR=/tmp/job-agent-tex python - <<'\''PY'\''
from awesomecv_jinja import render_pdf, load_sample
from pathlib import Path

data = load_sample("resume")
out = Path("/tmp/job-agent-tex/resume.pdf")
render_pdf(data, output=out)
print("Wrote", out)
PY'
```

Copy the file out (read permission is restricted):

```bash
sudo cp /tmp/job-agent-tex/resume.pdf /path/to/job-agent/
sudo chown <your-user> /path/to/job-agent/resume.pdf
```

### Run the backend as the sandbox user (optional but recommended)

```bash
sudo -u latex_sandbox -H bash -lc 'cd /path/to/job-agent && source .venv/bin/activate && uvicorn backend.app.main:app --reload --port 8000'
```

## Current limitations

- Local-only (no auth, no hosted deployment).
- Resume input is plain text.
- Docker and production deployment are out of scope.
- Job sources are limited to what the backend service currently supports.
- Currently only LinkedIn results are returned.

## Implementation notes

- Search uses `jobspy` in the backend.
