from .awesomecv import (
    ALLOWED_DOC_TYPES,
    CvAwesomePayload,
    CvTemplateProvenance,
    map_canonical_to_template as map_awesomecv_to_template,
    map_canonical_to_template_deterministic as map_awesomecv_to_template_deterministic,
)
from ...schemas.search import CvCanonicalData


DEFAULT_TEMPLATE_ID = "hipstercv"

HIPSTER_DEFAULT_SECTION_ORDER = [
    "summary",
    "experience",
    "education",
    "certificates",
    "writing",
    "skills",
    "languages",
    "interests",
    "volunteer",
    "honors",
]

HIPSTER_SIDEBAR_SECTIONS = ["summary", "languages", "interests"]
HIPSTER_MAIN_SECTIONS = ["experience", "education", "skills", "volunteer", "writing", "certificates", "honors"]

HIPSTER_DEFAULT_SIDEBAR_SECTION_ORDER = ["summary", "languages", "interests"]
HIPSTER_DEFAULT_MAIN_SECTION_ORDER = ["experience", "education", "skills", "volunteer", "writing", "certificates", "honors"]

HIPSTER_SECTION_LABELS = {
    "summary": "Summary",
    "experience": "Experience",
    "education": "Education",
    "certificates": "Certificates",
    "writing": "Publications",
    "skills": "IT Skills",
    "languages": "Languages",
    "interests": "Interests",
    "strengths": "Strengths",
    "hobbies": "Hobbies",
    "volunteer": "Volunteer",
    "honors": "Awards",
}

ALLOWED_HOBBY_ICONS = {
    "bicycle",
    "book",
    "soccer",
    "music",
    "code",
    "camera",
    "plane",
    "heart",
    "tree",
    "gamepad",
    "paint",
    "hiking",
    "cooking",
    "travel",
    "running",
}


def _pick_valid_icon(icon: str | None, candidates: list[str] | None) -> str | None:
    if isinstance(icon, str):
        normalized = icon.strip().lower()
        if normalized in ALLOWED_HOBBY_ICONS:
            return normalized
    for candidate in candidates or []:
        if not isinstance(candidate, str):
            continue
        normalized = candidate.strip().lower()
        if normalized in ALLOWED_HOBBY_ICONS:
            return normalized
    return None


def _with_hipster_defaults(
    payload: CvAwesomePayload,
    canonical: CvCanonicalData,
    section_order: list[str] | None = None,
    sidebar_section_order: list[str] | None = None,
    main_section_order: list[str] | None = None,
) -> CvAwesomePayload:
    data = payload.model_dump()
    normalized_sidebar = [
        section
        for section in (sidebar_section_order or data.get("sidebar_section_order") or [])
        if section in HIPSTER_SIDEBAR_SECTIONS
    ]
    normalized_main = [
        section
        for section in (main_section_order or data.get("main_section_order") or [])
        if section in HIPSTER_MAIN_SECTIONS
    ]

    if not normalized_sidebar:
        fallback_sidebar = [
            section
            for section in (section_order or data.get("section_order") or [])
            if section in HIPSTER_SIDEBAR_SECTIONS
        ]
        normalized_sidebar = fallback_sidebar or HIPSTER_DEFAULT_SIDEBAR_SECTION_ORDER

    if not normalized_main:
        fallback_main = [
            section
            for section in (section_order or data.get("section_order") or [])
            if section in HIPSTER_MAIN_SECTIONS
        ]
        normalized_main = fallback_main or HIPSTER_DEFAULT_MAIN_SECTION_ORDER

    data["sidebar_section_order"] = normalized_sidebar
    data["main_section_order"] = normalized_main
    data["section_order"] = normalized_sidebar + normalized_main

    if not data.get("section_order"):
        data["section_order"] = HIPSTER_DEFAULT_SECTION_ORDER

    existing_labels = data.get("section_labels") or {}
    data["section_labels"] = {**HIPSTER_SECTION_LABELS, **existing_labels}
    data["strengths"] = [
        entry.name.strip()
        for entry in canonical.strengths
        if isinstance(entry.name, str) and entry.name.strip()
    ]
    data["hobbies"] = [
        {
            "name": hobby.name.strip(),
            "icon": _pick_valid_icon(hobby.icon, hobby.icon_candidates),
        }
        for hobby in canonical.hobbies
        if isinstance(hobby.name, str) and hobby.name.strip()
    ]
    return CvAwesomePayload.model_validate(data)


def map_canonical_to_template_deterministic(
    *,
    canonical: CvCanonicalData,
    section_order: list[str] | None = None,
    sidebar_section_order: list[str] | None = None,
    main_section_order: list[str] | None = None,
) -> tuple[CvAwesomePayload, list[CvTemplateProvenance]]:
    payload, provenance = map_awesomecv_to_template_deterministic(
        canonical=canonical,
        section_order=section_order,
        sidebar_section_order=sidebar_section_order,
        main_section_order=main_section_order,
    )
    return _with_hipster_defaults(
        payload,
        canonical=canonical,
        section_order=section_order,
        sidebar_section_order=sidebar_section_order,
        main_section_order=main_section_order,
    ), provenance


def map_canonical_to_template(
    *,
    canonical: CvCanonicalData,
    job_title: str,
    company: str | None,
    job_description: str,
    model: str,
    lm_timeout: float | None = None,
    output_language: str | None = None,
    section_order: list[str] | None = None,
    sidebar_section_order: list[str] | None = None,
    main_section_order: list[str] | None = None,
) -> tuple[CvAwesomePayload, list[CvTemplateProvenance]]:
    payload, provenance = map_awesomecv_to_template(
        canonical=canonical,
        job_title=job_title,
        company=company,
        job_description=job_description,
        model=model,
        lm_timeout=lm_timeout,
        output_language=output_language,
        section_order=section_order,
        sidebar_section_order=sidebar_section_order,
        main_section_order=main_section_order,
    )
    return _with_hipster_defaults(
        payload,
        canonical=canonical,
        section_order=section_order,
        sidebar_section_order=sidebar_section_order,
        main_section_order=main_section_order,
    ), provenance
