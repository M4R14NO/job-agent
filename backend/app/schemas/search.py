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
    model: str | None = None
    enable_rerank: bool = True
    rerank_top_n: int = 12
    precision_weight_embedding: float = 0.8
    precision_weight_keyword: float = 0.2


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
    keyword_score: int | None = None
    embedding_score: int | None = None
    rerank_score: int | None = None

    class Config:
        extra = "allow"


class SearchResponse(BaseModel):
    message: str
    resume_length: int
    has_wishes: bool
    jobs: list[SearchJob]


class ModelsResponse(BaseModel):
    models: list[str]


class CoverLetterRequest(BaseModel):
    resume_text: str
    job_title: str
    company: str | None = None
    job_description: str
    job_url: str | None = None
    model: str | None = None


class CoverLetterResponse(BaseModel):
    cover_letter: str