from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


class SearchRequest(BaseModel):
    resume_text: str
    wishes: str | None = None
    search_term: str | None = None
    location: str | None = None
    results_wanted: int = 10
    hours_old: int | None = 72
    is_remote: bool = False
    site_name: list[str] | None = None
    linkedin_fetch_description: bool = False
    description_format: str = "markdown"


@app.post("/search")
def start_search(payload: SearchRequest) -> dict:
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
    return {
        "message": "Search completed",
        "resume_length": len(payload.resume_text),
        "has_wishes": bool(payload.wishes),
        "jobs": jobs,
    }
