import math
import os
import re
import logging

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
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
from .schemas.auth import AuthStatusResponse, LoginRequest
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
    _resolve_profile_image_path,
)
from .services.cv_storage import RevisionMismatchError, get_profile_store
from .services.lmstudio_client import chat_completion, list_models, safe_request
from .services.linkedin_detail_service import fetch_linkedin_job_details
from .services.search_service import fetch_jobs
from .services.ranking_service import build_query_debug, score_jobs
from .services.logging_utils import build_pii_safe_log_extra
from .services.auth_service import (
    AuthConfigError,
    authenticate_admin_credentials,
    clear_login_failures,
    create_session_token,
    enforce_login_rate_limit,
    is_auth_enabled,
    register_login_failure,
    require_authenticated_user,
    set_session_cookie,
    clear_session_cookie,
)

app = FastAPI(title="Job Agent API")
logger = logging.getLogger(__name__)

SCRAPING_ENABLED_ENV_VAR = "ENABLE_SCRAPING"
CORS_ALLOW_ORIGINS_ENV_VAR = "CORS_ALLOW_ORIGINS"
DEFAULT_CORS_ALLOW_ORIGINS = ("http://localhost:5173",)
SCRAPING_DISABLED_DETAIL = {
    "code": "SCRAPING_DISABLED",
    "message": "Scraping and LinkedIn enrichment are disabled by configuration.",
    "env_var": SCRAPING_ENABLED_ENV_VAR,
}

ALLOWED_OUTPUT_LANGUAGES = {"english", "german", "french", "chinese", "spanish"}

OUTPUT_LANGUAGE_PROMPTS = {
    "english": "English",
    "german": "German",
    "french": "French",
    "chinese": "Chinese",
    "spanish": "Spanish",
}

GENERIC_UPSTREAM_ERROR_DETAIL = "Upstream processing failed."
LMSTUDIO_UNAVAILABLE_DETAIL = "LLM service is currently unavailable. Start LM Studio, load a model, and retry."
LMSTUDIO_TIMEOUT_DETAIL = "LLM service timed out. Check LM Studio and model readiness, then retry."
LMSTUDIO_REJECTED_DETAIL = "LLM service rejected this request. Verify selected model and input, then retry."
LMSTUDIO_MODEL_INCOMPATIBLE_DETAIL = (
    "Selected model appears incompatible with this CV parsing mode. "
    "Choose a chat/instruct text model in LM Studio and retry."
)

_ERROR_DETAIL_REDACTIONS = (
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[redacted-email]"),
    (re.compile(r"https?://\S+", flags=re.IGNORECASE), "[redacted-url]"),
    # Broad number-pattern masking to avoid leaking phone-like identifiers.
    (re.compile(r"\+?\d[\d\s()./-]{6,}\d"), "[redacted-number]"),
)


def _parse_cors_allow_origins() -> list[str]:
    raw_value = os.getenv(CORS_ALLOW_ORIGINS_ENV_VAR, "")
    if not raw_value.strip():
        return list(DEFAULT_CORS_ALLOW_ORIGINS)

    origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
    if not origins:
        raise RuntimeError(f"{CORS_ALLOW_ORIGINS_ENV_VAR} must include at least one valid origin")

    has_wildcard = "*" in origins
    if has_wildcard and len(origins) > 1:
        raise RuntimeError(
            f"{CORS_ALLOW_ORIGINS_ENV_VAR} cannot mix '*' with explicit origins"
        )
    return origins


_cors_allow_origins = _parse_cors_allow_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "scraping_enabled": _is_scraping_enabled(),
    }


@app.post("/auth/login", response_model=AuthStatusResponse)
def login(payload: LoginRequest, request: Request, response: Response) -> AuthStatusResponse:
    if not is_auth_enabled():
        raise HTTPException(status_code=503, detail="Authentication is disabled by configuration")

    try:
        enforce_login_rate_limit(request)
        is_valid = authenticate_admin_credentials(payload.username, payload.password)
    except AuthConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not is_valid:
        register_login_failure(request)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    clear_login_failures(request)

    try:
        token = create_session_token(payload.username)
        set_session_cookie(response, token)
    except AuthConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AuthStatusResponse(auth_enabled=True, authenticated=True, username=payload.username)


@app.post("/auth/logout", response_model=AuthStatusResponse)
def logout(response: Response) -> AuthStatusResponse:
    if not is_auth_enabled():
        return AuthStatusResponse(auth_enabled=False, authenticated=True, username=None)
    clear_session_cookie(response)
    return AuthStatusResponse(auth_enabled=True, authenticated=False, username=None)


@app.get("/auth/me", response_model=AuthStatusResponse)
def auth_me(request: Request) -> AuthStatusResponse:
    if not is_auth_enabled():
        return AuthStatusResponse(auth_enabled=False, authenticated=True, username=None)
    username = require_authenticated_user(request)
    return AuthStatusResponse(auth_enabled=True, authenticated=True, username=username)


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
        allowed = ", ".join(f"'{item}'" for item in sorted(ALLOWED_OUTPUT_LANGUAGES))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported output_language. Use one of: {allowed}.",
        )
    return normalized


def _normalize_mapping_mode(value: str | None) -> str:
    if value is None:
        return "deterministic"
    normalized = value.strip().lower()
    if normalized not in {"deterministic", "llm"}:
        raise HTTPException(status_code=400, detail="Unsupported mapping_mode. Use 'deterministic' or 'llm'.")
    return normalized


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _is_scraping_enabled() -> bool:
    return _is_truthy(os.getenv(SCRAPING_ENABLED_ENV_VAR, "0"))


def _ensure_scraping_enabled() -> None:
    if not _is_scraping_enabled():
        raise HTTPException(status_code=503, detail=SCRAPING_DISABLED_DETAIL)


def _redact_error_detail(message: str) -> str:
    redacted = message
    for pattern, replacement in _ERROR_DETAIL_REDACTIONS:
        redacted = pattern.sub(replacement, redacted)
    redacted = redacted.strip()
    if not redacted:
        return GENERIC_UPSTREAM_ERROR_DETAIL
    return redacted


def _runtime_error_response(exc: RuntimeError) -> HTTPException:
    message = str(exc)
    normalized = message.lower()
    logger.warning(
        "Runtime upstream error (sanitized): %s",
        _redact_error_detail(message),
        extra=build_pii_safe_log_extra(error=exc),
    )
    if "error code:" in normalized or "traceback" in normalized or "lmstudio" in normalized:
        if "timed out" in normalized or "timeout" in normalized:
            return HTTPException(status_code=504, detail=LMSTUDIO_TIMEOUT_DETAIL)
        if "llguidance" in normalized or "pointer" in normalized or "json_schema" in normalized:
            return HTTPException(status_code=502, detail=LMSTUDIO_MODEL_INCOMPATIBLE_DETAIL)
        if "error code: 400" in normalized or "bad request" in normalized:
            return HTTPException(status_code=502, detail=LMSTUDIO_REJECTED_DETAIL)
        return HTTPException(status_code=502, detail=LMSTUDIO_UNAVAILABLE_DETAIL)

    redacted_detail = _redact_error_detail(message)
    if "timed out" in message.lower():
        return HTTPException(status_code=504, detail=redacted_detail)
    return HTTPException(status_code=502, detail=redacted_detail)


def _lmstudio_error_response(error: str | None) -> HTTPException:
    message = str(error or "")
    normalized = message.lower()
    logger.warning(
        "LMStudio request failed (sanitized): %s",
        _redact_error_detail(message),
        extra=build_pii_safe_log_extra(error=RuntimeError(message or "LMStudio request failed")),
    )
    if "timed out" in normalized or "timeout" in normalized:
        return HTTPException(status_code=504, detail=LMSTUDIO_TIMEOUT_DETAIL)
    if "llguidance" in normalized or "pointer" in normalized or "json_schema" in normalized:
        return HTTPException(status_code=502, detail=LMSTUDIO_MODEL_INCOMPATIBLE_DETAIL)
    if "error code: 400" in normalized or "bad request" in normalized:
        return HTTPException(status_code=502, detail=LMSTUDIO_REJECTED_DETAIL)
    return HTTPException(status_code=502, detail=LMSTUDIO_UNAVAILABLE_DETAIL)


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
        raise _lmstudio_error_response(error)
    return ModelsResponse(models=models or [])


@app.post("/search", response_model=SearchResponse)
def start_search(payload: SearchRequest) -> SearchResponse:
    _ensure_scraping_enabled()
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
    _ensure_scraping_enabled()
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
                description_html=result.description_html,
                status=result.status,
                error=result.error,
            )
            for result in results
        ]
    )


@app.post("/cover-letter", response_model=CoverLetterResponse)
def generate_cover_letter(
    payload: CoverLetterRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> CoverLetterResponse:
    if not payload.model:
        raise HTTPException(status_code=400, detail="Model is required")

    output_language = _normalize_output_language(payload.output_language)
    language_name = OUTPUT_LANGUAGE_PROMPTS.get(output_language or "")
    language_line = f" Write the letter in {language_name}." if language_name else ""

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
        raise _lmstudio_error_response(error)

    if not content:
        raise HTTPException(status_code=502, detail="LLM service returned an empty response. Please retry.")

    return CoverLetterResponse(cover_letter=content or "")


@app.post("/cv")
def generate_cv(
    payload: CvRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> Response:
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
        raise _runtime_error_response(exc) from exc

    filename = f"cv-{payload.doc_type}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@app.post("/cv/parse", response_model=CvParseResponse)
def parse_cv(
    payload: CvParseRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> CvParseResponse:
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
        raise _runtime_error_response(exc) from exc
    return CvParseResponse(schema_version=CANONICAL_SCHEMA_VERSION, data=data)


@app.post("/cv/validate")
def validate_cv(
    payload: CvValidateRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> dict:
    if payload.schema_version != CANONICAL_SCHEMA_VERSION:
        raise HTTPException(status_code=400, detail="Unsupported canonical schema version")
    return {"ok": True}


@app.post("/cv/profile-image")
async def upload_cv_profile_image(
    file: UploadFile = File(...),
    _current_user: str = Depends(require_authenticated_user),
) -> dict:
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


@app.get("/cv/profile-image/{image_name}")
def get_cv_profile_image(
    image_name: str,
    _current_user: str = Depends(require_authenticated_user),
) -> FileResponse:
    resolved = _resolve_profile_image_path(image_name)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Profile image not found")
    return FileResponse(resolved)


@app.get("/cv/profiles", response_model=CvProfileListResponse)
def list_cv_profiles(_current_user: str = Depends(require_authenticated_user)) -> CvProfileListResponse:
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
def get_cv_profile(
    profile_id: str,
    _current_user: str = Depends(require_authenticated_user),
) -> CvCanonicalProfile:
    store = get_profile_store()
    profile = store.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.put("/cv/profiles/{profile_id}", response_model=CvCanonicalProfile)
def save_cv_profile(
    profile_id: str,
    payload: CvCanonicalProfile,
    _current_user: str = Depends(require_authenticated_user),
) -> CvCanonicalProfile:
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
def delete_cv_profile(
    profile_id: str,
    _current_user: str = Depends(require_authenticated_user),
) -> dict:
    store = get_profile_store()
    store.delete_profile(profile_id)
    return {"ok": True}


@app.post("/cv/render")
def render_cv_from_canonical(
    payload: CvRenderRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> Response:
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
                section_labels=payload.section_labels,
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
            )
        else:
            if not deterministic_mapper:
                raise HTTPException(status_code=400, detail="Template does not support deterministic mapping")
            template_payload, _ = deterministic_mapper(
                canonical=payload.data,
                output_language=output_language,
                section_order=payload.section_order,
                section_labels=payload.section_labels,
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
            )
        pdf_bytes = render_cv_pdf_from_payload(payload=template_payload.model_dump(), doc_type=payload.doc_type)
    except RuntimeError as exc:
        raise _runtime_error_response(exc) from exc

    filename = f"cv-{payload.doc_type}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@app.post("/cv/preview", response_model=CvPreviewResponse)
def preview_cv_mapping(
    payload: CvPreviewRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> CvPreviewResponse:
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
                section_labels=payload.section_labels,
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
            )
        else:
            if not deterministic_mapper:
                raise HTTPException(status_code=400, detail="Template does not support deterministic mapping")
            template_payload, _ = deterministic_mapper(
                canonical=payload.data,
                output_language=output_language,
                section_order=payload.section_order,
                section_labels=payload.section_labels,
                sidebar_section_order=payload.sidebar_section_order,
                main_section_order=payload.main_section_order,
            )
    except RuntimeError as exc:
        raise _runtime_error_response(exc) from exc

    return CvPreviewResponse(payload=template_payload.model_dump())


@app.post("/cv/rewrite", response_model=CvRewriteResponse)
def rewrite_cv(
    payload: CvRewriteRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> CvRewriteResponse:
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
        raise _runtime_error_response(exc) from exc

    return CvRewriteResponse(schema_version=CANONICAL_SCHEMA_VERSION, data=data)


@app.post("/cv/render-template")
def render_cv_from_template(
    payload: CvRenderTemplateRequest,
    _current_user: str = Depends(require_authenticated_user),
) -> Response:
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
        raise _runtime_error_response(exc) from exc

    filename = f"cv-{payload.doc_type}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )
