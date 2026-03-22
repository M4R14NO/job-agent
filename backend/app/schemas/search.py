from datetime import date

from pydantic import BaseModel


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


class SearchJob(BaseModel):
    title: str | None = None
    company: str | None = None
    company_name: str | None = None
    location: str | None = None
    site: str | None = None
    job_url: str | None = None
    description: str | None = None
    job_description: str | None = None
    snippet: str | None = None
    date_posted: date | str | None = None
    match_score: int | None = None
    match_reasons: list[str] | None = None

    class Config:
        extra = "allow"


class SearchResponse(BaseModel):
    message: str
    resume_length: int
    has_wishes: bool
    jobs: list[SearchJob]