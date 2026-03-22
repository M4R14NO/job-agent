# Job Agent Prototype

Local-only prototype with a FastAPI backend and React/Vite frontend. Resume input is plain text only (paste or .txt upload later). Docker is out of scope for now.

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
