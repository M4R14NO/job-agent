# Job Agent Prototype

A local-first job search assistant with a FastAPI backend and a React/Vite frontend. It lets you search, normalize, and rerank job results, then generate a tailored cover letter from your resume text.

This repo is a public prototype. It focuses on local development and assumes you bring your own LLM endpoint (e.g. via LMStudio).

## What you can do

- Search job sources and view normalized results.
- Rerank results with an LLM to surface the best matches.
- Inspect match reasons and scores per job.
- Generate a cover letter for a selected job using your resume text.
- Create and edit an AwesomeCV-based CV with live PDF preview.
- Save CV profiles and tailor CV sections for specific applications.
- Cache and reuse the latest search response from the UI.

## Screenshots

These screenshots show the core workflow from search to application-ready documents.

### 1) Find relevant jobs quickly
Start with a focused search form and get normalized results in one place.

<img width="321" height="758" alt="Search jobs form" src="https://github.com/user-attachments/assets/60ebf8f6-dd26-42e9-86e4-fd4a9cec71e6" />

### 2) Prioritize jobs with match scores and reasons
Review ranked results, open job details, and understand why a role is considered a good fit before investing time in applying.

<img width="1487" height="766" alt="Job results list with LLM match scores" src="https://github.com/user-attachments/assets/32cb0245-067d-460a-89a2-92f9c31a8633" />

<img width="731" height="758" alt="Job details modal with reranking reason" src="https://github.com/user-attachments/assets/23f9e4b5-2e8f-49fb-abe9-a2037e859bf9" />

### 3) Draft cover letters faster
Generate a tailored cover letter from your resume text and the selected job context directly in the app.

<img width="1512" height="755" alt="Cover letter generation screen" src="https://github.com/user-attachments/assets/7c629791-e197-49a3-a8ae-cda7963502e0" />

### 4) Build and refine a CV with live feedback
Move from raw resume text to a polished PDF CV, with a side-by-side editor and live preview while you make changes.

<img width="1512" height="755" alt="CV generation landing view" src="https://github.com/user-attachments/assets/4b23fad7-eb2b-411c-bae9-1c26dd23d48d" />

<img width="1512" height="774" alt="CV editor with PDF preview" src="https://github.com/user-attachments/assets/6a7efa98-d2ca-4a14-95fc-69b6cf5dd146" />

Use assisted rewriting for specific sections when you want to improve clarity or tone.

<img width="773" height="300" alt="LLM rewrite controls in CV editor" src="https://github.com/user-attachments/assets/a395d6b4-0a6a-41b5-bbea-c524f00addb4" />

### 5) Keep reusable profiles and tailor each version
Save CV profiles, edit section content in detail (for example, role history), and choose which sections should be shown for each application.

<img width="789" height="259" alt="Save CV profile controls" src="https://github.com/user-attachments/assets/4a0b54b8-2d51-43af-bb94-de709637174a" />

<img width="1433" height="761" alt="CV section editor" src="https://github.com/user-attachments/assets/71312c36-4981-4ef2-b6e5-df281209f045" />

<img width="1433" height="761" alt="Experience section editing example" src="https://github.com/user-attachments/assets/a084f62d-2187-4ddf-991b-ddf9064ed023" />

<img width="971" height="302" alt="Live PDF preview update" src="https://github.com/user-attachments/assets/4ca1c208-08b9-461a-b260-175c7eb7af33" />

<img width="707" height="143" alt="Show or hide CV sections" src="https://github.com/user-attachments/assets/83624bdd-c21b-4944-b240-57b88f01c2b3" />

> 🚧 Work in progress: the CV tooling is actively evolving, and more templates and customization options are planned.



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
