from __future__ import annotations

import re
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

LINKEDIN_JOB_ID_RE = re.compile(r"/jobs/view/(?P<job_id>\d+)")


@dataclass
class LinkedInDetailResult:
    job_url: str
    job_id: str | None
    description: str | None
    status: str
    error: str | None = None


def parse_linkedin_job_id(job_url: str | None) -> str | None:
    if not job_url:
        return None
    match = LINKEDIN_JOB_ID_RE.search(job_url)
    return match.group("job_id") if match else None


def _extract_description_from_html(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    container = soup.find(
        "div",
        class_=lambda value: isinstance(value, str) and "show-more-less-html__markup" in value,
    )
    if container is None:
        return None

    text = container.get_text("\n", strip=True)
    if not text:
        return None

    # Keep line breaks but collapse excessive whitespace-only lines.
    lines = [line.strip() for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return cleaned or None


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
                description = _extract_description_from_html(response.text)
                if description:
                    results.append(
                        LinkedInDetailResult(
                            job_url=job_url,
                            job_id=job_id,
                            description=description,
                            status="ok",
                        )
                    )
                else:
                    results.append(
                        LinkedInDetailResult(
                            job_url=job_url,
                            job_id=job_id,
                            description=None,
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
