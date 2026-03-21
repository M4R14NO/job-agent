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
