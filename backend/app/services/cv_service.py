import json
import logging
import os
import tempfile
import shutil
from datetime import datetime
from pathlib import Path

from ..schemas.search import CvCanonicalData
from .cv_mappers import get_deterministic_mapper, get_llm_mapper
from .cv_mappers.awesomecv import ALLOWED_DOC_TYPES, DEFAULT_TEMPLATE_ID
from .cv_utils import extract_json
from .lmstudio_client import chat_completion, safe_request

try:
    from awesomecv_jinja import PDFCompiler, Renderer
except ImportError as exc:  # pragma: no cover - dependency is optional for dev
    raise RuntimeError("awesomecv-jinja is required for CV generation") from exc


DEFAULT_TMP_DIR = os.getenv("CV_TMP_DIR", "/tmp/job-agent-tex")
DEBUG_TEX = os.getenv("CV_DEBUG_TEX", "0") == "1"
DEBUG_TEX_DIR = os.getenv("CV_DEBUG_TEX_DIR", "/tmp/job-agent-tex/debug")
CANONICAL_SCHEMA_VERSION = "v1"
DEFAULT_LM_TIMEOUT = float(os.getenv("LMSTUDIO_TIMEOUT", "240"))
logger = logging.getLogger(__name__)
TEMPLATE_ROOT_DIR = Path(__file__).resolve().parent.parent / "templates"
TEMPLATE_DIRS = {
    "awesomecv": TEMPLATE_ROOT_DIR / "awesome_cv",
    "hipstercv": TEMPLATE_ROOT_DIR / "hipster_cv",
}


def _build_canonical_prompt(
    resume_text: str,
    output_language: str | None = None,
    job_title: str | None = None,
    company: str | None = None,
    job_description: str | None = None,
    job_url: str | None = None,
) -> str:
    language_line = ""
    if output_language == "english":
        language_line = "Write all free-text fields in English. Translate if needed. "
    elif output_language == "german":
        language_line = "Write all free-text fields in German. Translate if needed. "
    job_context = ""
    if job_title or company or job_description or job_url:
        job_context = (
            "\nJob context (for light tailoring only):\n"
            f"Title: {job_title or ''}\n"
            f"Company: {company or ''}\n"
            f"Description: {job_description or ''}\n"
            f"URL: {job_url or ''}\n"
        )
    return (
        "Extract resume data into a canonical CV JSON object. "
        f"{language_line}"
        "If summary is missing, infer a concise summary from the resume without inventing facts. "
        "If job context is provided, lightly tailor wording in summary/headline/bullets to match the role "
        "while staying faithful to the resume. "
        "Return JSON only with the exact keys listed below. "
        "Do not include markdown or comments. "
        "Use stable IDs like exp_1, exp_1_bullet_1, edu_1, skill_1, etc. "
        "For hobbies, suggest icon candidates from this allowlist only: "
        "bicycle, book, soccer, music, code, camera, plane, heart, tree, gamepad, paint, hiking, cooking, travel, running. "
        "If a field is missing, use null or an empty list.\n\n"
        "Required JSON schema:\n"
        "{\n"
        f"  \"schema_version\": \"{CANONICAL_SCHEMA_VERSION}\",\n"
        "  \"data\": {\n"
        "    \"first_name\": string or null,\n"
        "    \"last_name\": string or null,\n"
        "    \"headline\": string or null,\n"
        "    \"summary\": string or null,\n"
        "    \"email\": string or null,\n"
        "    \"phone\": string or null,\n"
        "    \"location\": string or null,\n"
        "    \"links\": [string],\n"
        "    \"experience\": [\n"
        "      {\"id\": string, \"title\": string or null, \"organization\": string or null, \"location\": string or null, \"period\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
        "    ],\n"
        "    \"education\": [\n"
        "      {\"id\": string, \"degree\": string or null, \"institution\": string or null, \"location\": string or null, \"period\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
        "    ],\n"
        "    \"skills\": [\n"
        "      {\"id\": string, \"category\": string or null, \"items\": [string]}\n"
        "    ],\n"
        "    \"projects\": [\n"
        "      {\"id\": string, \"name\": string or null, \"role\": string or null, \"period\": string or null, \"description\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
        "    ],\n"
        "    \"volunteer\": [\n"
        "      {\"id\": string, \"role\": string or null, \"organization\": string or null, \"location\": string or null, \"period\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
        "    ],\n"
        "    \"certificates\": [\n"
        "      {\"id\": string, \"title\": string or null, \"issuer\": string or null, \"year\": string or null}\n"
        "    ],\n"
        "    \"publications\": [\n"
        "      {\"id\": string, \"title\": string or null, \"venue\": string or null, \"year\": string or null, \"notes\": string or null}\n"
        "    ],\n"
        "    \"languages\": [\n"
        "      {\"id\": string, \"name\": string or null, \"level\": string or null}\n"
        "    ],\n"
        "    \"interests\": [\n"
        "      {\"id\": string, \"name\": string or null}\n"
        "    ],\n"
        "    \"strengths\": [\n"
        "      {\"id\": string, \"name\": string or null}\n"
        "    ],\n"
        "    \"hobbies\": [\n"
        "      {\"id\": string, \"name\": string or null, \"icon\": string or null, \"icon_candidates\": [string]}\n"
        "    ],\n"
        "    \"awards\": [\n"
        "      {\"id\": string, \"title\": string or null, \"issuer\": string or null, \"year\": string or null}\n"
        "    ]\n"
        "  }\n"
        "}\n\n"
        "Resume text:\n"
        f"{resume_text}\n"
        f"{job_context}"
    )


def parse_resume_to_canonical(
    *,
    resume_text: str,
    model: str,
    lm_timeout: float | None = None,
    output_language: str | None = None,
    job_title: str | None = None,
    company: str | None = None,
    job_description: str | None = None,
    job_url: str | None = None,
) -> CvCanonicalData:
    effective_timeout = lm_timeout if lm_timeout is not None else DEFAULT_LM_TIMEOUT
    prompt = _build_canonical_prompt(
        resume_text,
        output_language=output_language,
        job_title=job_title,
        company=company,
        job_description=job_description,
        job_url=job_url,
    )
    json_schema = {
        "type": "object",
        "properties": {
            "schema_version": {"type": "string"},
            "data": CvCanonicalData.model_json_schema(),
        },
        "required": ["schema_version", "data"],
        "additionalProperties": False,
    }
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "canonical_cv",
            "schema": json_schema,
            "strict": True,
        },
    }

    content, error = safe_request(
        chat_completion,
        model=model,
        messages=[
            {"role": "system", "content": "You are a helpful assistant that outputs JSON only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=6000,
        response_format=response_format,
        timeout=effective_timeout,
    )
    if error:
        content, error = safe_request(
            chat_completion,
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=6000,
            timeout=effective_timeout,
        )
    if error:
        raise RuntimeError(f"LMStudio error: {error}")
    if not content:
        raise RuntimeError("LMStudio returned empty content")

    json_text = extract_json(content)
    try:
        payload = json.loads(json_text)
    except json.JSONDecodeError:
        fix_prompt = (
            "Complete and fix the following JSON so it is valid and complete. "
            "Return JSON only, no comments.\n\n"
            "Required JSON schema:\n"
            "{\n"
            f"  \"schema_version\": \"{CANONICAL_SCHEMA_VERSION}\",\n"
            "  \"data\": {\n"
            "    \"first_name\": string or null,\n"
            "    \"last_name\": string or null,\n"
            "    \"headline\": string or null,\n"
            "    \"summary\": string or null,\n"
            "    \"email\": string or null,\n"
            "    \"phone\": string or null,\n"
            "    \"location\": string or null,\n"
            "    \"links\": [string],\n"
            "    \"experience\": [\n"
            "      {\"id\": string, \"title\": string or null, \"organization\": string or null, \"location\": string or null, \"period\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
            "    ],\n"
            "    \"education\": [\n"
            "      {\"id\": string, \"degree\": string or null, \"institution\": string or null, \"location\": string or null, \"period\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
            "    ],\n"
            "    \"skills\": [\n"
            "      {\"id\": string, \"category\": string or null, \"items\": [string]}\n"
            "    ],\n"
            "    \"projects\": [\n"
            "      {\"id\": string, \"name\": string or null, \"role\": string or null, \"period\": string or null, \"description\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
            "    ],\n"
            "    \"volunteer\": [\n"
            "      {\"id\": string, \"role\": string or null, \"organization\": string or null, \"location\": string or null, \"period\": string or null, \"bullets\": [{\"id\": string, \"text\": string or null, \"source_id\": string or null}]}\n"
            "    ],\n"
            "    \"certificates\": [\n"
            "      {\"id\": string, \"title\": string or null, \"issuer\": string or null, \"year\": string or null}\n"
            "    ],\n"
            "    \"publications\": [\n"
            "      {\"id\": string, \"title\": string or null, \"venue\": string or null, \"year\": string or null, \"notes\": string or null}\n"
            "    ],\n"
            "    \"languages\": [\n"
            "      {\"id\": string, \"name\": string or null, \"level\": string or null}\n"
            "    ],\n"
            "    \"interests\": [\n"
            "      {\"id\": string, \"name\": string or null}\n"
            "    ],\n"
            "    \"strengths\": [\n"
            "      {\"id\": string, \"name\": string or null}\n"
            "    ],\n"
            "    \"hobbies\": [\n"
            "      {\"id\": string, \"name\": string or null, \"icon\": string or null, \"icon_candidates\": [string]}\n"
            "    ],\n"
            "    \"awards\": [\n"
            "      {\"id\": string, \"title\": string or null, \"issuer\": string or null, \"year\": string or null}\n"
            "    ]\n"
            "  }\n"
            "}\n\n"
            "Broken JSON to fix:\n"
            f"{json_text}"
        )
        fixed_content, fix_error = safe_request(
            chat_completion,
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs JSON only."},
                {"role": "user", "content": fix_prompt},
            ],
            temperature=0.0,
            max_tokens=6000,
            timeout=effective_timeout,
        )
        if not fix_error and fixed_content:
            json_text = extract_json(fixed_content)
            payload = json.loads(json_text)
        else:
            content, error = safe_request(
                chat_completion,
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that outputs JSON only."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=6000,
                timeout=effective_timeout,
            )
            if error or not content:
                raise ValueError("Failed to parse LLM JSON payload")
            json_text = extract_json(content)
            payload = json.loads(json_text)

    schema_version = payload.get("schema_version")
    if schema_version != CANONICAL_SCHEMA_VERSION:
        raise ValueError("Unsupported canonical schema version")
    data = payload.get("data")
    try:
        return CvCanonicalData.model_validate(data)
    except Exception:
        logger.exception("CV canonical validation failed", extra={"canonical_payload": data})
        raise


def rewrite_canonical_with_prompt(
    *,
    canonical: CvCanonicalData,
    prompt: str,
    model: str,
    lm_timeout: float | None = None,
    output_language: str | None = None,
    job_title: str | None = None,
    company: str | None = None,
    job_description: str | None = None,
    job_url: str | None = None,
) -> CvCanonicalData:
    language_line = ""
    if output_language == "english":
        language_line = "Write all free-text fields in English. Translate if needed. "
    elif output_language == "german":
        language_line = "Write all free-text fields in German. Translate if needed. "

    job_context = ""
    if job_title or company or job_description or job_url:
        job_context = (
            "\nJob context:\n"
            f"Title: {job_title or ''}\n"
            f"Company: {company or ''}\n"
            f"Description: {job_description or ''}\n"
            f"URL: {job_url or ''}\n"
        )

    system = (
        "You are a resume editor. Rewrite canonical CV data to better match the job context and user prompt "
        "without inventing experience or changing meaning. "
        "Preserve IDs and list ordering. Only edit text fields. "
        f"{language_line}"
        "Return JSON only with the exact keys listed below."
    )
    user = (
        "User instructions:\n"
        f"{prompt}\n\n"
        "Canonical JSON:\n"
        f"{json.dumps(canonical.model_dump(), ensure_ascii=True)}\n"
        f"{job_context}"
    )
    json_schema = CvCanonicalData.model_json_schema()
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "canonical_rewrite",
            "schema": json_schema,
            "strict": True,
        },
    }
    content, error = safe_request(
        chat_completion,
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,
        max_tokens=4000,
        response_format=response_format,
        timeout=lm_timeout,
    )
    if error:
        content, error = safe_request(
            chat_completion,
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            max_tokens=4000,
            timeout=lm_timeout,
        )
    if error:
        raise RuntimeError(f"LMStudio error: {error}")
    if not content:
        raise RuntimeError("LMStudio returned empty content")

    json_text = extract_json(content)
    payload = json.loads(json_text)
    return CvCanonicalData.model_validate(payload)


def generate_cv_pdf(
    *,
    resume_text: str,
    job_title: str,
    company: str | None,
    job_description: str,
    model: str,
    doc_type: str,
    template_id: str,
    lm_timeout: float | None = None,
    output_language: str | None = None,
) -> bytes:
    llm_mapper = get_llm_mapper(template_id)
    deterministic_mapper = get_deterministic_mapper(template_id)
    if not llm_mapper and not deterministic_mapper:
        raise ValueError(f"Unsupported template_id: {template_id}")
    if doc_type not in ALLOWED_DOC_TYPES:
        raise ValueError(f"Unsupported doc_type: {doc_type}")

    canonical = parse_resume_to_canonical(
        resume_text=resume_text,
        model=model,
        lm_timeout=lm_timeout,
        output_language=output_language,
    )

    if llm_mapper:
        template_payload, _ = llm_mapper(
            canonical=canonical,
            job_title=job_title,
            company=company,
            job_description=job_description,
            model=model,
            lm_timeout=lm_timeout,
            output_language=output_language,
        )
    else:
        template_payload, _ = deterministic_mapper(canonical=canonical)

    data = template_payload.model_dump()
    if not data.get("summary"):
        data["sections"]["summary"] = False
    if not data.get("experience"):
        data["sections"]["experience"] = False
    if not data.get("education"):
        data["sections"]["education"] = False
    if not data.get("skills"):
        data["sections"]["skills"] = False

    return render_cv_pdf_from_payload(payload=data, doc_type=doc_type, template_id=template_id)


def _get_renderer(template_id: str) -> Renderer:
    template_dir = TEMPLATE_DIRS.get(template_id)
    if template_dir and template_dir.exists():
        return Renderer(custom_template_dir=template_dir)
    return Renderer(template="awesome_cv")


def _copy_template_assets(template_id: str, target_dir: Path) -> None:
    template_dir = TEMPLATE_DIRS.get(template_id)
    if template_dir and template_dir.exists():
        for source_path in template_dir.rglob("*"):
            if source_path.is_dir() or source_path.name.endswith(".j2"):
                continue
            relative_path = source_path.relative_to(template_dir)
            destination = target_dir / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)
        if template_id != DEFAULT_TEMPLATE_ID:
            return

    cls_path = TEMPLATE_DIRS[DEFAULT_TEMPLATE_ID] / "awesome-cv.cls"
    if cls_path.exists():
        shutil.copy2(cls_path, target_dir / "awesome-cv.cls")
        return

    try:
        from importlib.resources import files

        cls_content = files("awesomecv_jinja").joinpath("templates/awesome_cv/awesome-cv.cls").read_text()
        (target_dir / "awesome-cv.cls").write_text(cls_content, encoding="utf-8")
    except Exception:
        pass


def render_cv_pdf_from_payload(*, payload: dict, doc_type: str, template_id: str = DEFAULT_TEMPLATE_ID) -> bytes:
    tmp_root = Path(DEFAULT_TMP_DIR)
    tmp_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(dir=tmp_root) as tmp_dir:
        output_path = Path(tmp_dir) / "cv.pdf"
        tex_path = Path(tmp_dir) / "cv.tex"
        renderer = _get_renderer(template_id)
        renderer.render(doc_type, payload, output=tex_path)
        _copy_template_assets(template_id, Path(tmp_dir))
        if DEBUG_TEX:
            debug_root = Path(DEBUG_TEX_DIR)
            debug_root.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            debug_path = debug_root / f"cv-{template_id}-{doc_type}-{timestamp}.tex"
            debug_path.write_text(tex_path.read_text(encoding="utf-8"), encoding="utf-8")
        compiler = PDFCompiler()
        compiler.compile_file(tex_path, output=output_path)
        return output_path.read_bytes()
