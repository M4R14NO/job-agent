from __future__ import annotations

import re
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

LINKEDIN_JOB_ID_RE = re.compile(r"/jobs/view/(?P<job_id>\d+)")

# Attributes to strip from LinkedIn HTML before storing/displaying
_STRIP_ATTRS = frozenset({"class", "style", "id", "dir"})


@dataclass
class LinkedInDetailResult:
    job_url: str
    job_id: str | None
    description: str | None
    status: str
    description_html: str | None = None
    error: str | None = None


def parse_linkedin_job_id(job_url: str | None) -> str | None:
    if not job_url:
        return None
    match = LINKEDIN_JOB_ID_RE.search(job_url)
    return match.group("job_id") if match else None


def _extract_description_from_html(html: str) -> tuple[str | None, str | None]:
    """Return (plain_text, clean_html) extracted from a LinkedIn job page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    container = soup.find(
        "div",
        class_=lambda value: isinstance(value, str) and "show-more-less-html__markup" in value,
    )
    if container is None:
        return None, None

    # Plain text for LLM prompts and keyword ranking (no HTML noise).
    plain_text = container.get_text(separator="\n", strip=True).strip() or None

    # Clean HTML for display: strip presentational / tracking attributes but
    # keep all semantic tags (<strong>, <ul>, <li>, <p>, <br>, etc.) intact so
    # the browser renders structure correctly.
    for tag in container.find_all(True):
        for attr in list(tag.attrs.keys()):
            if attr in _STRIP_ATTRS or attr.startswith("data-"):
                del tag[attr]
    clean_html = container.decode_contents().strip() or None

    return plain_text, clean_html


def fetch_linkedin_job_details(
    jobs: list[dict],
    *,
    timeout_seconds: float = 8.0,
    user_agent: str = "Mozilla/5.0 (compatible; JobAgent/1.0)",
) -> list[LinkedInDetailResult]:
    seen: set[str] = set()
    results: list[LinkedInDetailResult] = []

    headers = {
        "User-Agent": user_agent,
        "Accept-Language": "en-US,en;q=0.9",
    }

    with httpx.Client(timeout=timeout_seconds, follow_redirects=True, headers=headers) as client:
        for job in jobs:
            job_url = str(job.get("job_url") or "").strip()
            job_id = parse_linkedin_job_id(job_url)

            dedupe_key = job_id or job_url
            if not dedupe_key:
                results.append(
                    LinkedInDetailResult(
                        job_url="",
                        job_id=None,
                        description=None,
                        status="invalid",
                        error="Missing job_url",
                    )
                )
                continue

            if dedupe_key in seen:
                results.append(
                    LinkedInDetailResult(
                        job_url=job_url,
                        job_id=job_id,
                        description=None,
                        status="skipped_duplicate",
                    )
                )
                continue
            seen.add(dedupe_key)

            if not job_url:
                results.append(
                    LinkedInDetailResult(
                        job_url="",
                        job_id=job_id,
                        description=None,
                        status="invalid",
                        error="Missing job_url",
                    )
                )
                continue

            try:
                response = client.get(job_url)
                response.raise_for_status()
                description, description_html = _extract_description_from_html(response.text)
                if description or description_html:
                    results.append(
                        LinkedInDetailResult(
                            job_url=job_url,
                            job_id=job_id,
                            description=description,
                            description_html=description_html,
                            status="ok",
                        )
                    )
                else:
                    results.append(
                        LinkedInDetailResult(
                            job_url=job_url,
                            job_id=job_id,
                            description=None,
                            description_html=None,
                            status="not_found",
                        )
                    )
            except httpx.TimeoutException as exc:
                results.append(
                    LinkedInDetailResult(
                        job_url=job_url,
                        job_id=job_id,
                        description=None,
                        status="timeout",
                        error=str(exc),
                    )
                )
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                results.append(
                    LinkedInDetailResult(
                        job_url=job_url,
                        job_id=job_id,
                        description=None,
                        status="http_error",
                        error=f"HTTP {status_code}" if status_code is not None else str(exc),
                    )
                )
            except Exception as exc:
                results.append(
                    LinkedInDetailResult(
                        job_url=job_url,
                        job_id=job_id,
                        description=None,
                        status="error",
                        error=str(exc),
                    )
                )

    return results
