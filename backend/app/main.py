import math

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas.search import (
    CoverLetterRequest,
    CoverLetterResponse,
    ModelsResponse,
    SearchRequest,
    SearchResponse,
)
from .services.lmstudio_client import chat_completion, list_models, safe_request
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


def _default_rerank_top_n(total_jobs: int, results_wanted: int) -> int:
    if total_jobs <= 0:
        return 0
    cap = min(total_jobs, results_wanted)
    return max(3, math.ceil(0.4 * cap))


@app.get("/models", response_model=ModelsResponse)
def get_models() -> ModelsResponse:
    models, error = safe_request(list_models)
    if error:
        raise HTTPException(status_code=502, detail=f"LMStudio error: {error}")
    return ModelsResponse(models=models or [])


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
    total_jobs = len(jobs)
    rerank_top_n = payload.rerank_top_n
    if payload.enable_rerank:
        if rerank_top_n is None:
            rerank_top_n = _default_rerank_top_n(total_jobs, payload.results_wanted)
        else:
            max_allowed = min(payload.results_wanted, total_jobs)
            if max_allowed > 0:
                rerank_top_n = max(1, min(rerank_top_n, max_allowed))
            else:
                rerank_top_n = 0
    else:
        rerank_top_n = 0

    jobs, rerank_applied, rerank_used = score_jobs(
        jobs=jobs,
        resume_text=payload.resume_text,
        wishes=payload.wishes,
        model=payload.model,
        enable_rerank=payload.enable_rerank,
        rerank_top_n=rerank_top_n,
        weight_embedding=payload.precision_weight_embedding,
        weight_keyword=payload.precision_weight_keyword,
    )
    return SearchResponse(
        message="Search completed",
        resume_length=len(payload.resume_text),
        has_wishes=bool(payload.wishes),
        jobs=jobs,
        rerank_applied=rerank_applied,
        rerank_top_n=rerank_used,
    )


@app.post("/cover-letter", response_model=CoverLetterResponse)
def generate_cover_letter(payload: CoverLetterRequest) -> CoverLetterResponse:
    if not payload.model:
        raise HTTPException(status_code=400, detail="Model is required")

    system = (
        "You are a hiring assistant who writes concise, tailored cover letters. "
        "Use a professional tone, keep it under 300 words, and focus on fit. "
        "Return only the final cover letter text with no analysis or reasoning."
    )
    user = (
        f"Resume:\n{payload.resume_text}\n\n"
        f"Job title: {payload.job_title}\n"
        f"Company: {payload.company or ''}\n"
        f"Job description:\n{payload.job_description}\n\n"
        "Write a cover letter in plain text."
    )

    content, error = safe_request(
        chat_completion,
        model=payload.model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.4,
        max_tokens=700,
    )
    if error:
        raise HTTPException(status_code=502, detail=f"LMStudio error: {error}")

    if not content:
        raise HTTPException(status_code=502, detail="LMStudio returned empty content")

    return CoverLetterResponse(cover_letter=content or "")
