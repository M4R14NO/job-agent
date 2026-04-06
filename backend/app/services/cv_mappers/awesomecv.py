import json

from pydantic import BaseModel, Field

from ...schemas.search import CvCanonicalData
from ..cv_utils import extract_json, sanitize_payload, truncate_text
from ..lmstudio_client import chat_completion, safe_request


DEFAULT_TEMPLATE_ID = "awesomecv"
ALLOWED_DOC_TYPES = {"resume", "cv"}

MAX_EXPERIENCE_ENTRIES = 4
MAX_EDUCATION_ENTRIES = 3
MAX_SKILL_GROUPS = 4
MAX_BULLETS_PER_ENTRY = 4
MAX_BULLET_CHARS = 180
MAX_SUMMARY_CHARS = 600
MAX_SKILL_ITEM_CHARS = 120


class CvSections(BaseModel):
    summary: bool = True
    experience: bool = True
    education: bool = True
    skills: bool = True
    honors: bool = False
    certificates: bool = False
    presentation: bool = False
    writing: bool = False
    committees: bool = False
    extracurricular: bool = False

    class Config:
        extra = "forbid"


class CvExperience(BaseModel):
    title: str
    organization: str
    location: str
    period: str
    details: list[str] | None = None

    class Config:
        extra = "forbid"


class CvEducation(BaseModel):
    degree: str
    institution: str
    location: str
    period: str
    details: list[str] | None = None

    class Config:
        extra = "forbid"


class CvSkill(BaseModel):
    category: str
    list: str

    class Config:
        extra = "forbid"


class CvCertificate(BaseModel):
    title: str
    organization: str | None = None
    location: str | None = None
    date: str | None = None

    class Config:
        extra = "forbid"


class CvWriting(BaseModel):
    role: str | None = None
    title: str
    location: str | None = None
    period: str | None = None
    details: list[str] | None = None

    class Config:
        extra = "forbid"


class CvAwesomePayload(BaseModel):
    first_name: str
    last_name: str
    position: str
    address: str
    mobile: str
    email: str
    homepage: str | None = None
    github: str | None = None
    linkedin: str | None = None
    summary: str | None = None
    experience: list[CvExperience] = Field(default_factory=list)
    education: list[CvEducation] = Field(default_factory=list)
    skills: list[CvSkill] = Field(default_factory=list)
    certificates: list[CvCertificate] = Field(default_factory=list)
    writings: list[CvWriting] = Field(default_factory=list)
    sections: CvSections = Field(default_factory=CvSections)

    class Config:
        extra = "forbid"


class CvTemplateProvenance(BaseModel):
    section: str
    item_id: str
    source_ids: list[str] = Field(default_factory=list)

    class Config:
        extra = "forbid"


class CvTemplateMapping(BaseModel):
    payload: CvAwesomePayload
    provenance: list[CvTemplateProvenance] = Field(default_factory=list)

    class Config:
        extra = "forbid"


def _build_template_prompt(canonical: CvCanonicalData, job_title: str, company: str | None, job_description: str) -> str:
    company_text = company or ""
    canonical_json = canonical.model_dump()
    return (
        "Map canonical CV data into the AwesomeCV template JSON. "
        "You may rephrase, select, and reorder bullets to fit the job description. "
        "Respect these caps: experience entries <= 4, education entries <= 3, skills groups <= 4, bullets per entry <= 4. "
        "Provide provenance by listing source IDs for each output bullet. "
        "Return JSON only with the exact keys listed below.\n\n"
        "Required JSON schema:\n"
        "{\n"
        "  \"payload\": {\n"
        "    \"first_name\": string,\n"
        "    \"last_name\": string,\n"
        "    \"position\": string,\n"
        "    \"address\": string,\n"
        "    \"mobile\": string,\n"
        "    \"email\": string,\n"
        "    \"homepage\": string or empty,\n"
        "    \"github\": string or empty,\n"
        "    \"linkedin\": string or empty,\n"
        "    \"summary\": string or empty,\n"
        "    \"experience\": [\n"
        "      {\"title\": string, \"organization\": string, \"location\": string, \"period\": string, \"details\": [string]}\n"
        "    ],\n"
        "    \"education\": [\n"
        "      {\"degree\": string, \"institution\": string, \"location\": string, \"period\": string, \"details\": [string]}\n"
        "    ],\n"
        "    \"skills\": [\n"
        "      {\"category\": string, \"list\": string}\n"
        "    ],\n"
        "    \"certificates\": [\n"
        "      {\"title\": string, \"organization\": string or empty, \"location\": string or empty, \"date\": string or empty}\n"
        "    ],\n"
        "    \"writings\": [\n"
        "      {\"role\": string or empty, \"title\": string, \"location\": string or empty, \"period\": string or empty, \"details\": [string]}\n"
        "    ],\n"
        "    \"sections\": {\n"
        "      \"summary\": true/false,\n"
        "      \"experience\": true/false,\n"
        "      \"education\": true/false,\n"
        "      \"skills\": true/false,\n"
        "      \"honors\": false,\n"
        "      \"certificates\": true/false,\n"
        "      \"presentation\": false,\n"
        "      \"writing\": true/false,\n"
        "      \"committees\": false,\n"
        "      \"extracurricular\": false\n"
        "    }\n"
        "  },\n"
        "  \"provenance\": [\n"
        "    {\"section\": string, \"item_id\": string, \"source_ids\": [string]}\n"
        "  ]\n"
        "}\n\n"
        "Canonical data:\n"
        f"{json.dumps(canonical_json, ensure_ascii=True)}\n\n"
        "Target job:\n"
        f"Title: {job_title}\n"
        f"Company: {company_text}\n"
        f"Description: {job_description}\n"
    )


def _enforce_template_limits(data: dict) -> dict:
    data["experience"] = data.get("experience", [])[:MAX_EXPERIENCE_ENTRIES]
    data["education"] = data.get("education", [])[:MAX_EDUCATION_ENTRIES]
    data["skills"] = data.get("skills", [])[:MAX_SKILL_GROUPS]

    for entry in data.get("experience", []):
        items = entry.get("details") or []
        items = [
            truncate_text(item, MAX_BULLET_CHARS)
            for item in items[:MAX_BULLETS_PER_ENTRY]
            if isinstance(item, str)
        ]
        entry["details"] = items

    for entry in data.get("education", []):
        items = entry.get("details") or []
        items = [
            truncate_text(item, MAX_BULLET_CHARS)
            for item in items[:MAX_BULLETS_PER_ENTRY]
            if isinstance(item, str)
        ]
        entry["details"] = items

    if isinstance(data.get("summary"), str):
        data["summary"] = truncate_text(data["summary"], MAX_SUMMARY_CHARS)

    for skill in data.get("skills", []):
        if isinstance(skill.get("list"), str):
            skill["list"] = truncate_text(skill["list"], MAX_SKILL_ITEM_CHARS)

    return data


def _fallback_payload_from_canonical(canonical: CvCanonicalData) -> dict:
    experience = []
    for entry in canonical.experience[:MAX_EXPERIENCE_ENTRIES]:
        items = [bullet.text for bullet in entry.bullets[:MAX_BULLETS_PER_ENTRY]]
        experience.append(
            {
                "title": entry.title,
                "organization": entry.organization,
                "location": entry.location or "",
                "period": entry.period or "",
                "details": items,
            }
        )

    education = []
    for entry in canonical.education[:MAX_EDUCATION_ENTRIES]:
        items = [bullet.text for bullet in entry.bullets[:MAX_BULLETS_PER_ENTRY]]
        education.append(
            {
                "degree": entry.degree,
                "institution": entry.institution or "",
                "location": entry.location or "",
                "period": entry.period or "",
                "details": items,
            }
        )

    skills = []
    for entry in canonical.skills[:MAX_SKILL_GROUPS]:
        items_text = ", ".join(entry.items)
        skills.append({"category": entry.category, "list": items_text})

    certificates = []
    for entry in canonical.certificates:
        certificates.append(
            {
                "title": entry.title,
                "organization": entry.issuer or "",
                "location": "",
                "date": entry.year or "",
            }
        )

    writing = []
    for entry in canonical.publications:
        details = [entry.notes] if entry.notes else []
        writing.append(
            {
                "role": "Publication",
                "title": entry.title,
                "location": entry.venue or "",
                "period": entry.year or "",
                "details": details,
            }
        )

    return {
        "experience": experience,
        "education": education,
        "skills": skills,
        "certificates": certificates,
        "writings": writing,
    }


def _has_nonempty_items(items: list[str] | None) -> bool:
    if not items:
        return False
    return any(isinstance(item, str) and item.strip() for item in items)


def map_canonical_to_template(
    *,
    canonical: CvCanonicalData,
    job_title: str,
    company: str | None,
    job_description: str,
    model: str,
    lm_timeout: float | None = None,
) -> tuple[CvAwesomePayload, list[CvTemplateProvenance]]:
    prompt = _build_template_prompt(canonical, job_title, company, job_description)
    json_schema = CvTemplateMapping.model_json_schema()
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "awesomecv_mapping",
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
        max_tokens=3000,
        response_format=response_format,
        timeout=lm_timeout,
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
            max_tokens=3000,
            timeout=lm_timeout,
        )
    if error:
        raise RuntimeError(f"LMStudio error: {error}")
    if not content:
        raise RuntimeError("LMStudio returned empty content")

    json_text = extract_json(content)
    payload = json.loads(json_text)
    payload = sanitize_payload(payload)
    validated = CvTemplateMapping.model_validate(payload)
    data = validated.payload.model_dump()
    data = _enforce_template_limits(data)
    fallback = _fallback_payload_from_canonical(canonical)

    if not data.get("experience"):
        data["experience"] = fallback["experience"]
    else:
        for idx, entry in enumerate(data["experience"]):
            if not _has_nonempty_items(entry.get("details")):
                entry["details"] = fallback["experience"][min(idx, len(fallback["experience"]) - 1)]["details"]

    if not data.get("education"):
        data["education"] = fallback["education"]
    else:
        for idx, entry in enumerate(data["education"]):
            if not _has_nonempty_items(entry.get("details")):
                entry["details"] = fallback["education"][min(idx, len(fallback["education"]) - 1)]["details"]

    if not data.get("skills"):
        data["skills"] = fallback["skills"]
    else:
        for idx, entry in enumerate(data["skills"]):
            items_value = entry.get("list")
            if not isinstance(items_value, str) or not items_value.strip():
                entry["list"] = fallback["skills"][min(idx, len(fallback["skills"]) - 1)]["list"]

    if not data.get("certificates") and fallback["certificates"]:
        data["certificates"] = fallback["certificates"]
        data["sections"]["certificates"] = True

    if not data.get("writings") and fallback["writings"]:
        data["writings"] = fallback["writings"]
        data["sections"]["writing"] = True

    validated_payload = CvAwesomePayload.model_validate(data)
    return validated_payload, validated.provenance
