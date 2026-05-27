import math

from fastapi import FastAPI, File, HTTPException, UploadFile
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
    LinkedInEnrichRequest,
    LinkedInEnrichResponse,
    LinkedInEnrichItem,
    QueryDebugRequest,
    QueryDebugResponse,
    RerankJobsRequest,
    ScoreJobsRequest,
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
    save_profile_image,
)
from .services.cv_storage import RevisionMismatchError, get_profile_store
from .services.lmstudio_client import chat_completion, list_models, safe_request
from .services.linkedin_detail_service import fetch_linkedin_job_details
from .services.search_service import fetch_jobs
from .services.ranking_service import build_query_debug, score_jobs

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


def _build_profile_query_context(profile: CvCanonicalProfile) -> str:
    data = profile.data
    parts: list[str] = []

    for value in [data.headline, data.summary]:
        if value:
            parts.append(value)

    for skill_group in data.skills:
        if skill_group.category:
            parts.append(skill_group.category)
        if skill_group.items:
            parts.extend(skill_group.items[:20])

    for experience in data.experience[:8]:
        for value in [experience.title, experience.organization, experience.location]:
            if value:
                parts.append(value)
        for bullet in experience.bullets[:6]:
            if bullet.text:
                parts.append(bullet.text)

    for project in data.projects[:6]:
        for value in [project.name, project.role, project.description]:
            if value:
                parts.append(value)

    for publication in data.publications[:6]:
        if publication.title:
            parts.append(publication.title)
        if publication.notes:
            parts.append(publication.notes)

    # Keep query context bounded for predictable retrieval performance.
    return "\n".join(part.strip() for part in parts if part and part.strip())[:8000]


def _load_query_profile_context(profile_id: str | None) -> tuple[str | None, str | None]:
    if not profile_id:
        return None, None

    profile = get_profile_store().get_profile(profile_id)
    if not profile:
        return None, None

    return profile.profile_id, _build_profile_query_context(profile)


@app.get("/models", response_model=ModelsResponse)
def get_models() -> ModelsResponse:
    models, error = safe_request(list_models)
    if error:
        raise HTTPException(status_code=502, detail=f"LMStudio error: {error}")
    return ModelsResponse(models=models or [])


@app.post("/search", response_model=SearchResponse)
def start_search(payload: SearchRequest) -> SearchResponse:
    search_term = payload.search_term or "software engineer"
    # LinkedIn-only mode keeps source behavior deterministic and enables one-pass detail enrichment.
    sites = ["linkedin"]

    jobs = fetch_jobs(
        site_name=sites,
        search_term=search_term,
        location=payload.location,
        search_radius_km=payload.search_radius_km,
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

    query_profile_id, query_profile_context = _load_query_profile_context(payload.selected_rerank_profile_id)

    jobs, rerank_applied, rerank_used, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer = score_jobs(
        jobs=jobs,
        resume_text=payload.resume_text,
        wishes=payload.wishes,
        query_context_text=query_profile_context,
        model=payload.model,
        lm_timeout=payload.lm_timeout,
        enable_rerank=False,
        rerank_top_n=0,
        weight_embedding=payload.precision_weight_embedding,
        weight_keyword=payload.precision_weight_keyword,
        translation_model=None,
    )
    return SearchResponse(
        message="Search completed",
        resume_length=len(payload.resume_text),
        has_wishes=bool(payload.wishes),
        jobs=jobs,
        query_profile_id=query_profile_id,
        bm25_query=bm25_query,
        bm25_language=bm25_language,
        bm25_tokenizer=bm25_tokenizer,
        rerank_requested=payload.enable_rerank,
        rerank_applied=rerank_applied,
        rerank_top_n=rerank_used,
        rerank_skip_reason=rerank_skip_reason,
    )


@app.post("/search/query-debug", response_model=QueryDebugResponse)
def build_search_query_debug(payload: QueryDebugRequest) -> QueryDebugResponse:
    query_profile_id, query_profile_context = _load_query_profile_context(payload.selected_rerank_profile_id)
    if not payload.model:
        raise HTTPException(status_code=400, detail="A model is required for query debug.")
    bm25_query, bm25_query_terms, bm25_language, bm25_tokenizer = build_query_debug(
        resume_text=payload.resume_text,
        wishes=payload.wishes,
        query_context_text=query_profile_context,
        model=payload.model,
        lm_timeout=payload.lm_timeout,
    )
    return QueryDebugResponse(
        query_profile_id=query_profile_id,
        bm25_query=bm25_query,
        bm25_language=bm25_language,
        bm25_tokenizer=bm25_tokenizer,
        bm25_query_terms=dict(bm25_query_terms),
    )


@app.post("/search/score-jobs", response_model=SearchResponse)
def score_existing_jobs(payload: ScoreJobsRequest) -> SearchResponse:
    query_profile_id, query_profile_context = _load_query_profile_context(payload.selected_rerank_profile_id)
    jobs, rerank_applied, rerank_used, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer = score_jobs(
        jobs=payload.jobs,
        resume_text=payload.resume_text,
        wishes=payload.wishes,
        query_context_text=query_profile_context,
        model=payload.model,
        lm_timeout=payload.lm_timeout,
        enable_rerank=False,
        rerank_top_n=0,
        weight_embedding=payload.precision_weight_embedding,
        weight_keyword=payload.precision_weight_keyword,
        translation_model=None,
        bm25_query_terms_override=payload.bm25_query_terms,
        bm25_query_override=payload.bm25_query,
        bm25_language_override=payload.bm25_language,
        bm25_tokenizer_override=payload.bm25_tokenizer,
    )
    return SearchResponse(
        message="Job scores updated",
        resume_length=len(payload.resume_text),
        has_wishes=bool(payload.wishes),
        jobs=jobs,
        query_profile_id=query_profile_id,
        bm25_query=bm25_query,
        bm25_language=bm25_language,
        bm25_tokenizer=bm25_tokenizer,
        rerank_requested=False,
        rerank_applied=rerank_applied,
        rerank_top_n=rerank_used,
        rerank_skip_reason=rerank_skip_reason,
    )


@app.post("/search/rerank", response_model=SearchResponse)
def rerank_existing_jobs(payload: RerankJobsRequest) -> SearchResponse:
    if not payload.model:
        raise HTTPException(status_code=400, detail="A model is required for reranking.")
    query_profile_id, query_profile_context = _load_query_profile_context(payload.selected_rerank_profile_id)
    rerank_top_n = payload.rerank_top_n
    if rerank_top_n is None:
        rerank_top_n = _default_rerank_top_n(len(payload.jobs), len(payload.jobs))

    jobs, rerank_applied, rerank_used, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer = score_jobs(
        jobs=payload.jobs,
        resume_text=payload.resume_text,
        wishes=payload.wishes,
        query_context_text=query_profile_context,
        model=payload.model,
        lm_timeout=payload.lm_timeout,
        enable_rerank=True,
        rerank_top_n=rerank_top_n,
        weight_embedding=payload.precision_weight_embedding,
        weight_keyword=payload.precision_weight_keyword,
        translation_model=None,
        bm25_query_terms_override=payload.bm25_query_terms,
        bm25_query_override=payload.bm25_query,
        bm25_language_override=payload.bm25_language,
        bm25_tokenizer_override=payload.bm25_tokenizer,
    )
    return SearchResponse(
        message="Rerank completed",
        resume_length=len(payload.resume_text),
        has_wishes=bool(payload.wishes),
        jobs=jobs,
        query_profile_id=query_profile_id,
        bm25_query=bm25_query,
        bm25_language=bm25_language,
        bm25_tokenizer=bm25_tokenizer,
        rerank_requested=True,
        rerank_applied=rerank_applied,
        rerank_top_n=rerank_used,
        rerank_skip_reason=rerank_skip_reason,
    )


@app.post("/search/linkedin/enrich", response_model=LinkedInEnrichResponse)
def enrich_linkedin_details(payload: LinkedInEnrichRequest) -> LinkedInEnrichResponse:
    jobs = [job.model_dump() for job in payload.jobs]
    results = fetch_linkedin_job_details(
        jobs,
        timeout_seconds=payload.timeout_seconds or 8.0,
    )
    return LinkedInEnrichResponse(
        items=[
            LinkedInEnrichItem(
                job_url=result.job_url,
                job_id=result.job_id,
                description=result.description,
                status=result.status,
                error=result.error,
            )
            for result in results
        ]
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


@app.post("/cv/profile-image")
async def upload_cv_profile_image(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload an image.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Maximum size is 5 MB.")

    try:
        image_path = save_profile_image(file_bytes=content, original_filename=file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"image_path": image_path}


@app.get("/cv/profiles", response_model=CvProfileListResponse)
def list_cv_profiles() -> CvProfileListResponse:
    store = get_profile_store()
    try:
        profiles = store.list_profiles()
    except PermissionError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Cannot access CV profile store at {store.path}. Check file ownership and permissions.",
        ) from exc
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
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
            )
        else:
            if not deterministic_mapper:
                raise HTTPException(status_code=400, detail="Template does not support deterministic mapping")
            template_payload, _ = deterministic_mapper(
                canonical=payload.data,
                section_order=payload.section_order,
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
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
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
            )
        else:
            if not deterministic_mapper:
                raise HTTPException(status_code=400, detail="Template does not support deterministic mapping")
            template_payload, _ = deterministic_mapper(
                canonical=payload.data,
                section_order=payload.section_order,
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
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
    if not get_deterministic_mapper(payload.template_id) and not get_llm_mapper(payload.template_id):
        raise HTTPException(status_code=400, detail="Unsupported template_id")
    if payload.doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported doc_type")

    try:
        pdf_bytes = render_cv_pdf_from_payload(
            payload=payload.payload,
            doc_type=payload.doc_type,
            template_id=payload.template_id,
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
