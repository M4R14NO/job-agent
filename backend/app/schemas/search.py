from datetime import date

from pydantic import BaseModel, Field


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
    rerank_top_n: int | None = None
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
    rerank_applied: bool | None = None
    rerank_top_n: int | None = None


class ModelsResponse(BaseModel):
    models: list[str]


class CoverLetterRequest(BaseModel):
    resume_text: str
    job_title: str
    company: str | None = None
    job_description: str
    job_url: str | None = None
    model: str | None = None
    lm_timeout: float | None = None


class CoverLetterResponse(BaseModel):
    cover_letter: str


class CvRequest(BaseModel):
    resume_text: str
    job_title: str
    company: str | None = None
    job_description: str
    job_url: str | None = None
    model: str | None = None
    template_id: str = "awesomecv"
    doc_type: str = "resume"
    lm_timeout: float | None = None


class CvCanonicalBullet(BaseModel):
    id: str
    text: str
    source_id: str | None = None


class CvCanonicalExperience(BaseModel):
    id: str
    title: str
    organization: str
    location: str | None = None
    period: str | None = None
    bullets: list[CvCanonicalBullet] = Field(default_factory=list)


class CvCanonicalEducation(BaseModel):
    id: str
    degree: str
    institution: str | None = None
    location: str | None = None
    period: str | None = None
    bullets: list[CvCanonicalBullet] = Field(default_factory=list)


class CvCanonicalSkillGroup(BaseModel):
    id: str
    category: str
    items: list[str] = Field(default_factory=list)


class CvCanonicalProject(BaseModel):
    id: str
    name: str
    role: str | None = None
    period: str | None = None
    description: str | None = None
    bullets: list[CvCanonicalBullet] = Field(default_factory=list)


class CvCanonicalCertificate(BaseModel):
    id: str
    title: str
    issuer: str | None = None
    year: str | None = None


class CvCanonicalPublication(BaseModel):
    id: str
    title: str
    venue: str | None = None
    year: str | None = None
    notes: str | None = None


class CvCanonicalLanguage(BaseModel):
    id: str
    name: str
    level: str | None = None


class CvCanonicalAward(BaseModel):
    id: str
    title: str
    issuer: str | None = None
    year: str | None = None


class CvCanonicalData(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    headline: str | None = None
    summary: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = Field(default_factory=list)
    experience: list[CvCanonicalExperience] = Field(default_factory=list)
    education: list[CvCanonicalEducation] = Field(default_factory=list)
    skills: list[CvCanonicalSkillGroup] = Field(default_factory=list)
    projects: list[CvCanonicalProject] = Field(default_factory=list)
    certificates: list[CvCanonicalCertificate] = Field(default_factory=list)
    publications: list[CvCanonicalPublication] = Field(default_factory=list)
    languages: list[CvCanonicalLanguage] = Field(default_factory=list)
    awards: list[CvCanonicalAward] = Field(default_factory=list)


class CvAuditTrail(BaseModel):
    raw_resume_text: str | None = None
    parsed_canonical: CvCanonicalData | None = None
    edited_canonical: CvCanonicalData | None = None
    final_template_payload: dict | None = None


class CvCanonicalProfile(BaseModel):
    schema_version: str
    profile_id: str
    revision: int
    created_at: str | None = None
    updated_at: str | None = None
    data: CvCanonicalData
    audit: CvAuditTrail | None = None


class CvParseRequest(BaseModel):
    resume_text: str
    model: str | None = None
    lm_timeout: float | None = None


class CvParseResponse(BaseModel):
    schema_version: str
    data: CvCanonicalData


class CvValidateRequest(BaseModel):
    schema_version: str
    data: CvCanonicalData


class CvRenderRequest(BaseModel):
    data: CvCanonicalData
    job_title: str
    company: str | None = None
    job_description: str
    job_url: str | None = None
    model: str | None = None
    template_id: str = "awesomecv"
    doc_type: str = "resume"
    lm_timeout: float | None = None


class CvProfileListResponse(BaseModel):
    profiles: list[CvCanonicalProfile]