import json
import math
import re
from collections import Counter

from .lmstudio_client import chat_completion, create_embeddings, safe_request


WORD_RE = re.compile(r"[a-zA-Z0-9+#]{3,}")
STOP_WORDS = {
    "and", "the", "for", "with", "from", "that", "this", "you", "your",
    "are", "was", "were", "will", "would", "could", "should", "have",
    "has", "had", "not", "but", "about", "into", "over", "under", "then",
    "than", "them", "they", "their", "there", "here", "who", "what",
    "when", "where", "why", "how", "also", "such", "use", "using", "used",
    "ein", "eine", "einer", "eines", "einem", "einen", "und", "oder", "aber",
    "nicht", "nur", "auch", "dass", "das", "der", "die", "den", "dem",
    "des", "wir", "ihr", "sie", "du", "ich", "sein", "ist", "sind",
    "war", "waren", "wird", "werden", "mit", "von", "für", "bei", "auf",
    "im", "in", "am", "an", "als", "wie", "mehr", "noch", "sehr", "zum",
    "zur", "über", "unter", "damit", "ohne", "oder", "sowie", "sowohl"
}


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _extract_keywords(text: str) -> list[str]:
    tokens = WORD_RE.findall(text.lower())
    tokens = [token for token in tokens if token not in STOP_WORDS]
    counts = Counter(tokens)
    return [token for token, _ in counts.most_common(50)]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = 0.0
    left_mag = 0.0
    right_mag = 0.0
    for l_val, r_val in zip(left, right):
        dot += l_val * r_val
        left_mag += l_val * l_val
        right_mag += r_val * r_val

    if left_mag == 0.0 or right_mag == 0.0:
        return 0.0

    return dot / (math.sqrt(left_mag) * math.sqrt(right_mag))


def _normalize_similarity(score: float) -> int:
    normalized = (score + 1) / 2
    return max(0, min(100, int(round(normalized * 100))))


def _build_rerank_prompt(resume_text: str, jobs: list[dict]) -> list[dict[str, str]]:
    items = []
    for idx, job in enumerate(jobs):
        items.append(
            {
                "index": idx,
                "title": job.get("title") or "",
                "company": job.get("company") or job.get("company_name") or "",
                "location": job.get("location") or "",
                "description": _truncate(job.get("description") or job.get("job_description") or "", 1200),
            }
        )

    system = (
        "You are a recruiting assistant. Score each job for fit to the resume. "
        "Return only JSON: a list of objects with keys index, score, reason. "
        "Score must be 0-100."
    )
    user = json.dumps(
        {
            "resume_text": _truncate(resume_text, 2000),
            "jobs": items,
        },
        ensure_ascii=True,
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _parse_rerank_response(text: str) -> dict[int, dict]:
    if not text:
        return {}

    payload = text.strip()
    if not payload.startswith("["):
        start = payload.find("[")
        end = payload.rfind("]")
        if start != -1 and end != -1:
            payload = payload[start : end + 1]

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return {}

    if not isinstance(data, list):
        return {}

    results = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        score = item.get("score")
        reason = item.get("reason")
        if isinstance(index, int) and isinstance(score, (int, float)):
            results[index] = {
                "score": max(0, min(100, int(round(score)))),
                "reason": reason if isinstance(reason, str) else "",
            }
    return results


def score_jobs(
    *,
    jobs: list[dict],
    resume_text: str,
    wishes: str | None,
    model: str | None,
    enable_rerank: bool,
    rerank_top_n: int,
    weight_embedding: float,
    weight_keyword: float,
) -> list[dict]:
    weight_total = weight_embedding + weight_keyword
    if weight_total <= 0:
        weight_embedding = 0.8
        weight_keyword = 0.2
        weight_total = 1.0
    weight_embedding = weight_embedding / weight_total
    weight_keyword = weight_keyword / weight_total

    combined = f"{resume_text}\n{wishes or ''}".strip()
    keywords = _extract_keywords(combined)
    keyword_set = set(keywords)

    keyword_scores: list[int] = []
    keyword_matches: list[list[str]] = []
    for job in jobs:
        title = (job.get("title") or "").lower()
        description = (job.get("description") or job.get("job_description") or "").lower()
        haystack = f"{title} {description}"
        matched = [kw for kw in keyword_set if kw in haystack]

        score_base = max(5, len(keyword_set))
        score = min(100, int((len(matched) / score_base) * 100))
        keyword_scores.append(score)
        keyword_matches.append(matched[:5])

    embedding_scores: list[int | None] = [None] * len(jobs)
    if resume_text.strip() and jobs:
        texts = [resume_text]
        texts.extend(
            _truncate(job.get("description") or job.get("job_description") or "", 2000)
            for job in jobs
        )
        embeddings, error = safe_request(create_embeddings, texts)
        if not error and embeddings and len(embeddings) == len(texts):
            resume_embedding = embeddings[0]
            for idx, job_embedding in enumerate(embeddings[1:]):
                similarity = _cosine_similarity(resume_embedding, job_embedding)
                embedding_scores[idx] = _normalize_similarity(similarity)

    for idx, job in enumerate(jobs):
        keyword_score = keyword_scores[idx]
        embedding_score = embedding_scores[idx]
        if embedding_score is None:
            combined_score = keyword_score
        else:
            combined_score = int(round(
                (embedding_score * weight_embedding) + (keyword_score * weight_keyword)
            ))
        job["keyword_score"] = keyword_score
        job["embedding_score"] = embedding_score
        job["match_score"] = combined_score
        job["match_reasons"] = keyword_matches[idx] if keyword_set else []

    jobs.sort(key=lambda item: item.get("match_score", 0), reverse=True)

    if enable_rerank and model and jobs:
        top_n = max(1, min(rerank_top_n, len(jobs)))
        rerank_candidates = jobs[:top_n]
        messages = _build_rerank_prompt(resume_text, rerank_candidates)
        response, error = safe_request(
            chat_completion,
            model=model,
            messages=messages,
            temperature=0.1,
            max_tokens=700,
        )
        if not error and response:
            parsed = _parse_rerank_response(response)
            for idx, job in enumerate(rerank_candidates):
                rerank = parsed.get(idx)
                if not rerank:
                    continue
                rerank_score = rerank.get("score")
                if isinstance(rerank_score, int):
                    job["rerank_score"] = rerank_score
                    combined_score = int(round((rerank_score * 0.7) + (job.get("match_score", 0) * 0.3)))
                    job["match_score"] = combined_score
                    reason = rerank.get("reason")
                    if reason:
                        job["match_reasons"] = [reason]

            jobs.sort(key=lambda item: item.get("match_score", 0), reverse=True)

    return jobs
