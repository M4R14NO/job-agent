import re
from collections import Counter


WORD_RE = re.compile(r"[a-zA-Z0-9+#]{3,}")


def _extract_keywords(text: str) -> list[str]:
    tokens = WORD_RE.findall(text.lower())
    counts = Counter(tokens)
    return [token for token, _ in counts.most_common(50)]


def score_jobs(*, jobs: list[dict], resume_text: str, wishes: str | None) -> list[dict]:
    combined = f"{resume_text}\n{wishes or ''}".strip()
    keywords = _extract_keywords(combined)
    keyword_set = set(keywords)

    if not keyword_set:
        for job in jobs:
            job["match_score"] = 0
            job["match_reasons"] = []
        return jobs

    for job in jobs:
        title = (job.get("title") or "").lower()
        description = (job.get("description") or "").lower()
        haystack = f"{title} {description}"
        matched = [kw for kw in keyword_set if kw in haystack]

        score_base = max(5, len(keyword_set))
        score = min(100, int((len(matched) / score_base) * 100))
        job["match_score"] = score
        job["match_reasons"] = matched[:5]

    jobs.sort(key=lambda item: item.get("match_score", 0), reverse=True)
    return jobs
