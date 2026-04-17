import math

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from datetime import datetime

from .schemas.search import (
    CoverLetterRequest,
    CoverLetterResponse,
    CvParseRequest,
    CvParseResponse,
    CvProfileListResponse,
    CvCanonicalProfile,
    CvPreviewRequest,
    CvPreviewResponse,
    CvRenderRequest,
    CvRenderTemplateRequest,
    CvRequest,
    CvRewriteRequest,
    CvRewriteResponse,
    CvValidateRequest,
    ModelsResponse,
    SearchRequest,
    SearchResponse,
)
from .services.cv_mappers import get_deterministic_mapper, get_llm_mapper
from .services.cv_service import (
    ALLOWED_DOC_TYPES,
    CANONICAL_SCHEMA_VERSION,
    DEFAULT_TEMPLATE_ID,
    generate_cv_pdf,
    parse_resume_to_canonical,
    render_cv_pdf_from_payload,
    rewrite_canonical_with_prompt,
)
from .services.cv_mappers.awesomecv import CvAwesomePayload
from .services.cv_storage import RevisionMismatchError, get_profile_store
from .services.lmstudio_client import chat_completion, list_models, safe_request
from .services.search_service import fetch_jobs
from .services.ranking_service import score_jobs

app = FastAPI(title="Job Agent API")

ALLOWED_OUTPUT_LANGUAGES = {"english", "german"}

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


def _normalize_output_language(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in ALLOWED_OUTPUT_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported output_language. Use 'english' or 'german'.",
        )
    return normalized


def _normalize_mapping_mode(value: str | None) -> str:
    if value is None:
        return "deterministic"
    normalized = value.strip().lower()
    if normalized not in {"deterministic", "llm"}:
        raise HTTPException(status_code=400, detail="Unsupported mapping_mode. Use 'deterministic' or 'llm'.")
    return normalized


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

    output_language = _normalize_output_language(payload.output_language)
    language_line = ""
    if output_language == "english":
        language_line = " Write the letter in English."
    elif output_language == "german":
        language_line = " Write the letter in German."

    system = (
        "You are a hiring assistant who writes concise, tailored cover letters. "
        "Use a professional tone, keep it under 300 words, and focus on fit. "
        "Return only the final cover letter text with no analysis or reasoning."
        f"{language_line}"
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
        timeout=payload.lm_timeout,
    )
    if error:
        raise HTTPException(status_code=502, detail=f"LMStudio error: {error}")

    if not content:
        raise HTTPException(status_code=502, detail="LMStudio returned empty content")

    return CoverLetterResponse(cover_letter=content or "")


@app.post("/cv")
def generate_cv(payload: CvRequest) -> Response:
    if not payload.model:
        raise HTTPException(status_code=400, detail="Model is required")
    output_language = _normalize_output_language(payload.output_language)

    try:
        pdf_bytes = generate_cv_pdf(
            resume_text=payload.resume_text,
            job_title=payload.job_title,
            company=payload.company,
            job_description=payload.job_description,
            model=payload.model,
            doc_type=payload.doc_type,
            template_id=payload.template_id,
            lm_timeout=payload.lm_timeout,
            output_language=output_language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message:
            raise HTTPException(status_code=504, detail=message) from exc
        raise HTTPException(status_code=502, detail=message) from exc

    filename = f"cv-{payload.doc_type}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@app.post("/cv/parse", response_model=CvParseResponse)
def parse_cv(payload: CvParseRequest) -> CvParseResponse:
    if not payload.model:
        raise HTTPException(status_code=400, detail="Model is required")
    output_language = _normalize_output_language(payload.output_language)
    try:
        data = parse_resume_to_canonical(
            resume_text=payload.resume_text,
            model=payload.model,
            lm_timeout=payload.lm_timeout,
            output_language=output_language,
            job_title=payload.job_title,
            company=payload.company,
            job_description=payload.job_description,
            job_url=payload.job_url,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message:
            raise HTTPException(status_code=504, detail=message) from exc
        raise HTTPException(status_code=502, detail=message) from exc
    return CvParseResponse(schema_version=CANONICAL_SCHEMA_VERSION, data=data)


@app.post("/cv/validate")
def validate_cv(payload: CvValidateRequest) -> dict:
    if payload.schema_version != CANONICAL_SCHEMA_VERSION:
        raise HTTPException(status_code=400, detail="Unsupported canonical schema version")
    return {"ok": True}


@app.get("/cv/profiles", response_model=CvProfileListResponse)
def list_cv_profiles() -> CvProfileListResponse:
    store = get_profile_store()
    profiles = store.list_profiles()
    return CvProfileListResponse(profiles=profiles)


@app.get("/cv/profiles/{profile_id}", response_model=CvCanonicalProfile)
def get_cv_profile(profile_id: str) -> CvCanonicalProfile:
    store = get_profile_store()
    profile = store.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.put("/cv/profiles/{profile_id}", response_model=CvCanonicalProfile)
def save_cv_profile(profile_id: str, payload: CvCanonicalProfile) -> CvCanonicalProfile:
    if payload.profile_id != profile_id:
        raise HTTPException(status_code=400, detail="Profile ID mismatch")
    if payload.schema_version != CANONICAL_SCHEMA_VERSION:
        raise HTTPException(status_code=400, detail="Unsupported canonical schema version")

    store = get_profile_store()
    existing = store.get_profile(profile_id)
    now = datetime.utcnow().isoformat()

    if existing:
        if payload.revision != existing.revision:
            raise HTTPException(status_code=409, detail="Profile revision does not match")
        payload.revision = existing.revision + 1
        payload.created_at = existing.created_at
    else:
        if payload.revision not in (0, None):
            raise HTTPException(status_code=409, detail="Profile revision does not match")
        payload.revision = 1
        payload.created_at = now

    payload.updated_at = now
    try:
        return store.save_profile(payload, expected_revision=(existing.revision if existing else 0))
    except RevisionMismatchError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/cv/profiles/{profile_id}")
def delete_cv_profile(profile_id: str) -> dict:
    store = get_profile_store()
    store.delete_profile(profile_id)
    return {"ok": True}


@app.post("/cv/render")
def render_cv_from_canonical(payload: CvRenderRequest) -> Response:
    deterministic_mapper = get_deterministic_mapper(payload.template_id)
    llm_mapper = get_llm_mapper(payload.template_id)
    if not deterministic_mapper and not llm_mapper:
        raise HTTPException(status_code=400, detail="Unsupported template_id")
    if payload.doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported doc_type")
    output_language = _normalize_output_language(payload.output_language)
    mapping_mode = _normalize_mapping_mode(payload.mapping_mode)
    if mapping_mode == "llm" and not payload.model:
        raise HTTPException(status_code=400, detail="Model is required for LLM mapping")

    try:
        if mapping_mode == "llm":
            if not llm_mapper:
                raise HTTPException(status_code=400, detail="Template does not support LLM mapping")
            template_payload, _ = llm_mapper(
                canonical=payload.data,
                job_title=payload.job_title,
                company=payload.company,
                job_description=payload.job_description,
                model=payload.model,
                lm_timeout=payload.lm_timeout,
                output_language=output_language,
                section_order=payload.section_order,
            )
        else:
            if not deterministic_mapper:
                raise HTTPException(status_code=400, detail="Template does not support deterministic mapping")
            template_payload, _ = deterministic_mapper(
                canonical=payload.data,
                section_order=payload.section_order,
            )
        pdf_bytes = render_cv_pdf_from_payload(payload=template_payload.model_dump(), doc_type=payload.doc_type)
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message:
            raise HTTPException(status_code=504, detail=message) from exc
        raise HTTPException(status_code=502, detail=message) from exc

    filename = f"cv-{payload.doc_type}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@app.post("/cv/preview", response_model=CvPreviewResponse)
def preview_cv_mapping(payload: CvPreviewRequest) -> CvPreviewResponse:
    deterministic_mapper = get_deterministic_mapper(payload.template_id)
    llm_mapper = get_llm_mapper(payload.template_id)
    if not deterministic_mapper and not llm_mapper:
        raise HTTPException(status_code=400, detail="Unsupported template_id")
    if payload.doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported doc_type")
    output_language = _normalize_output_language(payload.output_language)
    mapping_mode = _normalize_mapping_mode(payload.mapping_mode)
    if mapping_mode == "llm" and not payload.model:
        raise HTTPException(status_code=400, detail="Model is required for LLM mapping")

    try:
        if mapping_mode == "llm":
            if not llm_mapper:
                raise HTTPException(status_code=400, detail="Template does not support LLM mapping")
            template_payload, _ = llm_mapper(
                canonical=payload.data,
                job_title=payload.job_title,
                company=payload.company,
                job_description=payload.job_description,
                model=payload.model,
                lm_timeout=payload.lm_timeout,
                output_language=output_language,
                section_order=payload.section_order,
            )
        else:
            if not deterministic_mapper:
                raise HTTPException(status_code=400, detail="Template does not support deterministic mapping")
            template_payload, _ = deterministic_mapper(
                canonical=payload.data,
                section_order=payload.section_order,
            )
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message:
            raise HTTPException(status_code=504, detail=message) from exc
        raise HTTPException(status_code=502, detail=message) from exc

    return CvPreviewResponse(payload=template_payload.model_dump())


@app.post("/cv/rewrite", response_model=CvRewriteResponse)
def rewrite_cv(payload: CvRewriteRequest) -> CvRewriteResponse:
    if not payload.model:
        raise HTTPException(status_code=400, detail="Model is required")
    output_language = _normalize_output_language(payload.output_language)
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    try:
        data = rewrite_canonical_with_prompt(
            canonical=payload.data,
            prompt=payload.prompt,
            model=payload.model,
            lm_timeout=payload.lm_timeout,
            output_language=output_language,
            job_title=payload.job_title,
            company=payload.company,
            job_description=payload.job_description,
            job_url=payload.job_url,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message:
            raise HTTPException(status_code=504, detail=message) from exc
        raise HTTPException(status_code=502, detail=message) from exc

    return CvRewriteResponse(schema_version=CANONICAL_SCHEMA_VERSION, data=data)


@app.post("/cv/render-template")
def render_cv_from_template(payload: CvRenderTemplateRequest) -> Response:
    if payload.doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported doc_type")

    try:
        validated_payload = CvAwesomePayload.model_validate(payload.payload)
        pdf_bytes = render_cv_pdf_from_payload(
            payload=validated_payload.model_dump(),
            doc_type=payload.doc_type,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message:
            raise HTTPException(status_code=504, detail=message) from exc
        raise HTTPException(status_code=502, detail=message) from exc

    filename = f"cv-{payload.doc_type}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )
