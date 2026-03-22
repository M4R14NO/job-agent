from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .schemas.search import SearchRequest, SearchResponse
from .services.search_service import fetch_jobs
from .services.ranking_service import score_jobs

app = FastAPI(title="Job Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.post("/search", response_model=SearchResponse)
def start_search(payload: SearchRequest) -> SearchResponse:
    search_term = payload.search_term or "software engineer"
    sites = payload.site_name or ["indeed", "linkedin", "google"]

    jobs = fetch_jobs(
        site_name=sites,
        search_term=search_term,
        location=payload.location,
        results_wanted=payload.results_wanted,
        hours_old=payload.hours_old,
        is_remote=payload.is_remote,
        linkedin_fetch_description=payload.linkedin_fetch_description,
        description_format=payload.description_format,
    )
    jobs = score_jobs(
        jobs=jobs,
        resume_text=payload.resume_text,
        wishes=payload.wishes,
    )
    return SearchResponse(
        message="Search completed",
        resume_length=len(payload.resume_text),
        has_wishes=bool(payload.wishes),
        jobs=jobs,
    )
