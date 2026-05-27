import json
import math
import os
import re
from collections import Counter

from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from rank_bm25 import BM25Okapi

try:
    import spacy
except Exception:  # pragma: no cover
    spacy = None

from .lmstudio_client import chat_completion, create_embeddings, safe_request


LLM_TRANSLATION_MAX_TERMS = int(os.getenv("LLM_TRANSLATION_MAX_TERMS", "28"))
LLM_TRANSLATION_TEMPERATURE = float(os.getenv("LLM_TRANSLATION_TEMPERATURE", "0.0"))
LLM_TRANSLATION_MAX_TOKENS = int(os.getenv("LLM_TRANSLATION_MAX_TOKENS", "700"))
LLM_QUERY_REFINEMENT_MAX_TERMS = int(os.getenv("LLM_QUERY_REFINEMENT_MAX_TERMS", "36"))
LLM_QUERY_REFINEMENT_TEMPERATURE = float(os.getenv("LLM_QUERY_REFINEMENT_TEMPERATURE", "0.0"))
LLM_QUERY_REFINEMENT_MAX_TOKENS = int(os.getenv("LLM_QUERY_REFINEMENT_MAX_TOKENS", "900"))


WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿß0-9+#]{3,}")
LINEBREAK_HYPHEN_RE = re.compile(r"([A-Za-zÀ-ÖØ-öø-ÿß]{2,})[-\u2010\u2011\u2012\u2013\u2014]\s*\n\s*([A-Za-zÀ-ÖØ-öø-ÿß]{2,})")
DASH_RE = re.compile(r"[\u2010\u2011\u2012\u2013\u2014\u2212]")
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

EN_HINT_WORDS = {
    "the", "and", "with", "for", "from", "engineer", "developer", "software",
    "data", "machine", "learning", "backend", "frontend", "cloud", "skills"
}

DE_HINT_WORDS = {
    "und", "mit", "fuer", "für", "der", "die", "das", "entwickler", "entwicklung",
    "software", "daten", "kenntnisse", "erfahrung", "beratung", "prozesse", "arbeit"
}

NOISE_TOKENS = {
    "gmbh", "ag", "kg", "ltd", "inc", "llc", "bis", "seit", "present", "heute",
    "thi", "live", "place", "nice", "serve", "good", "purpose",
    "nurnberg", "nuernberg", "nürnberg", "ingolstadt", "technology",
    "munich", "münchen", "germany", "deutschland", "berlin", "hamburg",
    "rivers", "volunteer", "university",
}

GENERIC_LOW_SIGNAL_TOKENS = {
    "aus", "durch", "mittels", "text", "training", "specialist", "specialized",
    "time", "work", "technical", "source", "tools", "tool",
}

LOW_PRIORITY_MISC_TOKENS = {
    "language", "web", "visual", "weight", "solutions", "efficiency", "scalable",
}

LANGUAGE_PROFICIENCY_TOKENS = {
    "verhandlungssicher", "muttersprache", "fließend", "fliessend", "bilingual", "native"
}

PUBLICATION_META_TOKENS = {
    "publication", "publications", "professional", "author", "erstautor", "coautor", "paper"
}

TOKEN_CANONICAL_MAP = {
    "llms": "llm",
    "apis": "api",
}

PHRASE_PATTERNS: list[tuple[tuple[str, ...], str]] = [
    (("low", "code"), "low_code"),
    (("speech", "understanding"), "speech_understanding"),
    (("natural", "language", "processing"), "natural_language_processing"),
    (("prompt", "engineering"), "prompt_engineering"),
    (("machine", "learning"), "machine_learning"),
    (("deep", "learning"), "deep_learning"),
    (("data", "science"), "data_science"),
    (("data", "engineer"), "data_engineer"),
    (("software", "engineering"), "software_engineering"),
    (("knowledge", "graph"), "knowledge_graph"),
    (("vector", "database"), "vector_database"),
    (("large", "language", "model"), "llm"),
    (("retrieval", "augmented", "generation"), "rag"),
]

PHRASE_COMPONENTS_BY_TOKEN = {
    phrase_token: set(parts)
    for parts, phrase_token in PHRASE_PATTERNS
}

PREFERRED_POS_TAGS = {"NOUN", "PROPN", "ADJ", "X"}
FILTERED_ENT_TYPES = {"GPE", "LOC", "NORP", "FAC"}

SKILL_LIKE_TOKEN_RE = re.compile(r"(?:[a-z]+[+#]|[a-z]{2,}\d+|\d+[a-z]{2,}|[a-z]{3,})")

_SPACY_PIPELINES: dict[str, object | None] = {
    "en": None,
    "de": None,
}
_SPACY_LOAD_ATTEMPTED: set[str] = set()


class _TranslationItem(BaseModel):
    source: str
    targets: list[str] = Field(default_factory=list)


class _TranslationPayload(BaseModel):
    translations: list[_TranslationItem] = Field(default_factory=list)


class _QueryRefinementItem(BaseModel):
    term: str
    weight: int | float = 1


class _QueryRefinementPayload(BaseModel):
    terms: list[_QueryRefinementItem] = Field(default_factory=list)


_TRANSLATION_OUTPUT_PARSER = PydanticOutputParser(pydantic_object=_TranslationPayload)
_QUERY_REFINEMENT_OUTPUT_PARSER = PydanticOutputParser(pydantic_object=_QueryRefinementPayload)


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _extract_keywords(text: str) -> list[str]:
    tokens = _fallback_tokens(text)
    counts = Counter(tokens)
    return [token for token, _ in counts.most_common(50)]


def _extract_json_payload(text: str):
    if not text:
        return None

    payload = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", payload, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        payload = fenced.group(1).strip()

    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def _merge_translation_maps(
    primary: dict[str, list[str]],
    secondary: dict[str, list[str]],
) -> dict[str, list[str]]:
    merged = dict(primary)
    for key, values in secondary.items():
        existing = merged.get(key, [])
        for value in values:
            if value not in existing:
                existing.append(value)
        merged[key] = existing
    return merged


def _parse_translation_response(text: str) -> dict[str, list[str]]:
    if not text:
        return {}

    parsed_payload: _TranslationPayload | None = None
    try:
        parsed_payload = _TRANSLATION_OUTPUT_PARSER.parse(text)
    except Exception:
        data = _extract_json_payload(text)
        if isinstance(data, dict):
            if "items" in data and "translations" not in data and isinstance(data.get("items"), list):
                data = {"translations": data.get("items")}
            try:
                parsed_payload = _TranslationPayload.model_validate(data)
            except Exception:
                parsed_payload = None

    if parsed_payload is None:
        return {}

    parsed: dict[str, list[str]] = {}
    for item in parsed_payload.translations:
        source = item.source
        targets = item.targets
        source_norm = source.strip().lower().replace(" ", "_")
        if not source_norm:
            continue
        normalized_targets: list[str] = []
        for target in targets:
            if not isinstance(target, str):
                continue
            norm = target.strip().lower().replace(" ", "_")
            if norm and norm != source_norm and norm not in normalized_targets:
                normalized_targets.append(norm)
        parsed[source_norm] = normalized_targets[:4]
    return parsed


def _parse_query_refinement_response(text: str) -> Counter:
    if not text:
        return Counter()

    parsed_payload: _QueryRefinementPayload | None = None
    try:
        parsed_payload = _QUERY_REFINEMENT_OUTPUT_PARSER.parse(text)
    except Exception:
        data = _extract_json_payload(text)
        if isinstance(data, list):
            data = {"terms": data}
        if isinstance(data, dict):
            try:
                parsed_payload = _QueryRefinementPayload.model_validate(data)
            except Exception:
                parsed_payload = None

    if parsed_payload is None:
        return Counter()

    refined = Counter()
    for item in parsed_payload.terms:
        term = item.term
        weight = item.weight
        term_norm = term.strip().lower().replace(" ", "_")
        if not term_norm:
            continue
        if not isinstance(weight, int):
            if isinstance(weight, float):
                weight = int(round(weight))
            else:
                weight = 1
        weight = max(1, min(9, weight))
        refined[term_norm] += weight

    return refined


def _llm_translate_terms(
    tokens: list[str],
    *,
    source_language: str,
    model: str | None,
    lm_timeout: float | None,
) -> dict[str, list[str]]:
    if not tokens:
        return {}

    translation_model = model
    if not translation_model:
        return {}

    target_language = "de" if source_language == "en" else "en"
    format_instructions = _TRANSLATION_OUTPUT_PARSER.get_format_instructions()
    system = (
        "You expand and translate professional and technical job-search terms between English and German. "
        "Return STRICT JSON only. "
        "Rules: preserve technical meaning; targets may include translated equivalents and close professional synonyms/compounds "
        "used in job ads; keep acronyms/invariant tech terms unchanged by returning empty targets; "
        "for well-known abbreviations, include expanded long-form variants (for example llm -> large_language_models, "
        "rag -> retrieval_augmented_generation, mlops -> machine_learning_operations) while keeping abbreviation forms too; "
        "do not output locations, "
        "company names, countries, cities, or generic filler words; output lowercase snake_case. "
        "For each high-signal English technical source term, include at least one German counterpart target when a valid one exists. "
        "Do not leave all such terms without German counterparts if suitable German variants are available.\n"
        f"{format_instructions}"
    )
    user_payload = {
        "source_language": source_language,
        "target_language": target_language,
        "terms": tokens,
    }

    content, error = safe_request(
        chat_completion,
        model=translation_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
        ],
        temperature=LLM_TRANSLATION_TEMPERATURE,
        max_tokens=LLM_TRANSLATION_MAX_TOKENS,
        response_format={"type": "json_object"},
        timeout=lm_timeout,
    )
    if error or not content:
        return {}
    return _parse_translation_response(content)


def _canonicalize_tokens(tokens: list[str]) -> list[str]:
    return [TOKEN_CANONICAL_MAP.get(token, token) for token in tokens]


def _augment_phrase_tokens(tokens: list[str]) -> list[str]:
    if not tokens:
        return tokens

    counts = Counter(tokens)
    augmented = list(tokens)
    for parts, phrase_token in PHRASE_PATTERNS:
        if all(counts.get(part, 0) > 0 for part in parts):
            occurrences = min(counts.get(parts[0], 1), 2)
            augmented.extend([phrase_token] * occurrences)
    return augmented


def _term_priority(token: str, weight: int) -> float:
    priority = float(weight)
    if token in PUBLICATION_META_TOKENS:
        priority *= 0.35
    if token in GENERIC_LOW_SIGNAL_TOKENS:
        priority *= 0.5
    if token in LOW_PRIORITY_MISC_TOKENS:
        priority *= 0.45
    return priority


def _pick_top_terms(query_counts: Counter, wishes_terms: set[str] | None = None, limit: int = 28) -> list[tuple[str, int]]:
    requested_terms = wishes_terms or set()

    def _priority(token: str, weight: int) -> float:
        priority = _term_priority(token, weight)
        if token in LANGUAGE_PROFICIENCY_TOKENS and token not in requested_terms:
            priority *= 0.35
        return priority

    suppressed_components: set[str] = set()
    for phrase_token, components in PHRASE_COMPONENTS_BY_TOKEN.items():
        if query_counts.get(phrase_token, 0) > 0:
            suppressed_components.update(components)

    ranked = sorted(
        query_counts.items(),
        key=lambda item: (_priority(item[0], item[1]), item[1], item[0]),
        reverse=True,
    )

    selected: list[tuple[str, int]] = []
    for token, weight in ranked:
        if token in suppressed_components and token not in PHRASE_COMPONENTS_BY_TOKEN:
            continue
        selected.append((token, weight))
        if len(selected) >= limit:
            break

    return selected


def _normalize_text_for_tokenization(text: str) -> str:
    value = str(text or "")
    value = value.replace("\u00ad", "")
    value = value.replace("\u200b", "")
    value = LINEBREAK_HYPHEN_RE.sub(r"\1\2", value)
    value = DASH_RE.sub(" ", value)
    return value


def _fallback_tokens(text: str) -> list[str]:
    normalized = _normalize_text_for_tokenization(text).lower()
    tokens = WORD_RE.findall(normalized)
    return [
        token
        for token in tokens
        if token not in STOP_WORDS
        and token not in NOISE_TOKENS
        and token not in GENERIC_LOW_SIGNAL_TOKENS
        and not re.fullmatch(r"\d{4}", token)
    ]


def _detect_query_language(text: str) -> str:
    tokens = WORD_RE.findall(_normalize_text_for_tokenization(text).lower())
    if not tokens:
        return "mixed"

    en_hits = sum(1 for token in tokens if token in EN_HINT_WORDS)
    de_hits = sum(1 for token in tokens if token in DE_HINT_WORDS)

    if en_hits == 0 and de_hits == 0:
        return "mixed"

    if en_hits > 0 and de_hits > 0:
        dominant_ratio = max(en_hits, de_hits) / max(1, min(en_hits, de_hits))
        if dominant_ratio <= 3.5:
            return "mixed"

    return "en" if en_hits > de_hits else "de"


def _get_spacy_pipeline(language: str):
    if language not in {"en", "de"}:
        return None
    if language in _SPACY_LOAD_ATTEMPTED:
        return _SPACY_PIPELINES.get(language)

    _SPACY_LOAD_ATTEMPTED.add(language)
    if spacy is None:
        _SPACY_PIPELINES[language] = None
        return None

    model_name = "en_core_web_sm" if language == "en" else "de_core_news_sm"
    try:
        _SPACY_PIPELINES[language] = spacy.load(model_name, disable=["parser", "textcat"])
    except Exception:
        _SPACY_PIPELINES[language] = None
    return _SPACY_PIPELINES[language]


def _spacy_tokens(text: str, language: str) -> list[str]:
    nlp = _get_spacy_pipeline(language)
    if nlp is None:
        return []

    normalized: list[str] = []
    for token in nlp(_normalize_text_for_tokenization(text)):
        if token.is_space:
            continue
        if token.is_stop:
            continue
        if token.ent_type_ in FILTERED_ENT_TYPES:
            continue
        if token.pos_ and token.pos_ not in PREFERRED_POS_TAGS and not SKILL_LIKE_TOKEN_RE.fullmatch(token.text.strip().lower()):
            continue
        raw = token.text.strip().lower()
        lemma = token.lemma_.strip().lower() if token.lemma_ else ""
        candidate = lemma or raw
        if (
            not candidate
            or candidate in STOP_WORDS
            or candidate in NOISE_TOKENS
            or candidate in GENERIC_LOW_SIGNAL_TOKENS
        ):
            continue
        if re.fullmatch(r"\d{4}", candidate):
            continue
        if len(candidate) < 3 and not re.fullmatch(r"[a-z][+#]", candidate):
            continue
        normalized.append(candidate)
    return normalized


def _normalize_tokens(text: str, language: str) -> list[str]:
    base = _fallback_tokens(text)
    if not text or not text.strip():
        return base

    if language == "mixed":
        en = _spacy_tokens(text, "en")
        de = _spacy_tokens(text, "de")
        tokens = _canonicalize_tokens(en + de + base)
        return _augment_phrase_tokens(tokens)

    chosen = _spacy_tokens(text, language)
    if not chosen:
        tokens = _canonicalize_tokens(base)
        return _augment_phrase_tokens(tokens)

    tokens = _canonicalize_tokens(chosen + base)
    return _augment_phrase_tokens(tokens)


def _resolve_tokenizer_mode(language: str) -> str:
    if language == "mixed":
        has_en = _get_spacy_pipeline("en") is not None
        has_de = _get_spacy_pipeline("de") is not None
        if has_en and has_de:
            return "spacy_mixed"
        if has_en or has_de:
            return "spacy_partial_fallback"
        return "fallback"

    if language in {"en", "de"}:
        return f"spacy_{language}" if _get_spacy_pipeline(language) is not None else "fallback"

    return "fallback"


def _build_boosted_terms(top_terms: list[tuple[str, int]]) -> list[str]:
    if not top_terms:
        return []

    boosted_terms: list[str] = []
    max_rank = max(1, len(top_terms) - 1)
    for rank, (token, weight) in enumerate(top_terms):
        rank_strength = (max_rank - rank) / max_rank
        weight_strength = math.log1p(max(1, weight))
        raw_boost = 2.0 + (2.2 * rank_strength) + (0.8 * min(2.0, weight_strength))
        boost = max(2, min(5, int(round(raw_boost))))
        boosted_terms.append(f"{token}^{boost}")
    return boosted_terms


def _expand_bilingual_terms(
    query_counts: Counter,
    language: str = "mixed",
    *,
    translation_model: str | None = None,
    lm_timeout: float | None = None,
) -> Counter:
    expanded = Counter(query_counts)

    active_phrase_components: set[str] = set()
    for phrase_token, components in PHRASE_COMPONENTS_BY_TOKEN.items():
        if query_counts.get(phrase_token, 0) > 0:
            active_phrase_components.update(components)

    candidates: list[tuple[str, int]] = []
    for token, weight in query_counts.items():
        if weight <= 0:
            continue
        if token in NOISE_TOKENS or token in GENERIC_LOW_SIGNAL_TOKENS:
            continue
        if token in active_phrase_components:
            continue
        candidates.append((token, weight))

    if not candidates:
        return expanded

    candidates.sort(key=lambda item: (item[1], item[0]), reverse=True)
    limited_tokens = [token for token, _ in candidates[:LLM_TRANSLATION_MAX_TERMS]]

    translations_by_token: dict[str, list[str]] = {}
    if language in {"en", "de"}:
        translations_by_token = _llm_translate_terms(
            limited_tokens,
            source_language=language,
            model=translation_model,
            lm_timeout=lm_timeout,
        )
    else:
        en_map = _llm_translate_terms(
            limited_tokens,
            source_language="en",
            model=translation_model,
            lm_timeout=lm_timeout,
        )
        de_map = _llm_translate_terms(
            limited_tokens,
            source_language="de",
            model=translation_model,
            lm_timeout=lm_timeout,
        )
        translations_by_token = _merge_translation_maps(en_map, de_map)

    for token, weight in candidates:
        for translated in translations_by_token.get(token, []):
            if translated == token:
                continue
            if translated in NOISE_TOKENS or translated in GENERIC_LOW_SIGNAL_TOKENS:
                continue
            expanded[translated] += max(1, int(round(weight * 0.6)))

    return expanded


def _prepare_bm25_query(
    resume_text: str,
    wishes: str | None,
    *,
    translation_model: str | None = None,
    lm_timeout: float | None = None,
) -> tuple[str | None, Counter, str]:
    language = _detect_query_language(f"{resume_text}\n{wishes or ''}")
    resume_tokens = _normalize_tokens(resume_text, language)
    wishes_tokens = _normalize_tokens(wishes or "", language)
    wishes_term_set = set(wishes_tokens)
    if not resume_tokens and not wishes_tokens:
        return None, Counter(), language

    query_counts: Counter = Counter(resume_tokens)
    for token in wishes_tokens:
        query_counts[token] += 1

    query_counts = _expand_bilingual_terms(
        query_counts,
        language,
        translation_model=translation_model,
        lm_timeout=lm_timeout,
    )

    top_terms = _pick_top_terms(query_counts, wishes_terms=wishes_term_set, limit=28)
    if not top_terms:
        return None, Counter(), language

    boosted_terms = _build_boosted_terms(top_terms)

    selected_terms = Counter({token: count for token, count in top_terms})
    return " ".join(boosted_terms), selected_terms, language


def build_query_debug(
    *,
    resume_text: str,
    wishes: str | None,
    model: str | None,
    lm_timeout: float | None,
    query_context_text: str | None = None,
) -> tuple[str | None, Counter, str, str]:
    bm25_query, bm25_query_terms, bm25_language = _prepare_bm25_query(
        resume_text,
        wishes,
        translation_model=model,
        lm_timeout=lm_timeout,
    )
    if query_context_text:
        _, profile_terms, _ = _prepare_bm25_query(
            query_context_text,
            None,
            translation_model=model,
            lm_timeout=lm_timeout,
        )
        if profile_terms:
            for token, weight in profile_terms.items():
                bm25_query_terms[token] += weight

    bm25_query_terms = _llm_refine_query_terms(
        bm25_query_terms,
        language=bm25_language,
        wishes=wishes,
        profile_context_text=query_context_text,
        model=model,
        lm_timeout=lm_timeout,
    )
    if bm25_query_terms:
        top_terms = _pick_top_terms(bm25_query_terms, limit=28)
        if top_terms:
            boosted_terms = _build_boosted_terms(top_terms)
            bm25_query = " ".join(boosted_terms)
            bm25_query_terms = Counter({token: count for token, count in top_terms})

    bm25_tokenizer = _resolve_tokenizer_mode(bm25_language)
    return bm25_query, bm25_query_terms, bm25_language, bm25_tokenizer


def _llm_refine_query_terms(
    query_counts: Counter,
    *,
    language: str,
    wishes: str | None,
    profile_context_text: str | None,
    model: str | None,
    lm_timeout: float | None,
) -> Counter:
    if not query_counts or not model:
        return query_counts

    candidate_terms = [
        {"term": token, "weight": int(weight)}
        for token, weight in query_counts.most_common(LLM_QUERY_REFINEMENT_MAX_TERMS)
    ]
    if not candidate_terms:
        return query_counts

    profile_hints: list[str] = []
    if profile_context_text:
        profile_hints = _extract_keywords(profile_context_text)[:80]

    system = (
        "You optimize BM25 query terms for job retrieval. "
        "Return STRICT JSON only. "
        "You may keep terms, add missing high-signal terms, remove weak terms, and adjust integer weights. "
        "Prioritize technical skills, roles, domains, and methods from the CV/profile context. "
        "For well-known abbreviations, keep the short form and include long-form expansion terms when available "
        "(for example llm + large_language_models, rag + retrieval_augmented_generation, mlops + machine_learning_operations). "
        "Avoid locations, organizations, generic filler words, and soft-skill noise. "
        "Output lowercase snake_case terms only. "
        "Bilingual retention rule: for each high-signal English technical term present in candidate_terms, preserve at least one "
        "German counterpart term in the final terms list when available; do not delete all DE variants for that concept.\n"
        f"{_QUERY_REFINEMENT_OUTPUT_PARSER.get_format_instructions()}"
    )
    user_payload = {
        "language": language,
        "wishes": wishes or "",
        "candidate_terms": candidate_terms,
        "profile_hints": profile_hints,
    }

    content, error = safe_request(
        chat_completion,
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
        ],
        temperature=LLM_QUERY_REFINEMENT_TEMPERATURE,
        max_tokens=LLM_QUERY_REFINEMENT_MAX_TOKENS,
        response_format={"type": "json_object"},
        timeout=lm_timeout,
    )
    if error or not content:
        return query_counts

    refined = _parse_query_refinement_response(content)
    if not refined:
        return query_counts

    filtered = Counter()
    for token, weight in refined.items():
        if token in STOP_WORDS or token in NOISE_TOKENS or token in GENERIC_LOW_SIGNAL_TOKENS:
            continue
        if re.fullmatch(r"\d{4}", token):
            continue
        if len(token) < 3 and not re.fullmatch(r"[a-z][+#]", token):
            continue
        filtered[token] += int(weight)

    return filtered or query_counts


def _build_bm25_documents(jobs: list[dict], language: str) -> list[list[str]]:
    documents: list[list[str]] = []

    for job in jobs:
        title_tokens = _normalize_tokens(job.get("title") or "", language)
        description_tokens = _normalize_tokens(job.get("description") or job.get("job_description") or "", language)
        tokens = (title_tokens * 2) + description_tokens
        documents.append(tokens)

    return documents


def _bm25_scores(jobs: list[dict], query_terms: Counter, language: str) -> tuple[list[int], list[list[str]]]:
    if not jobs or not query_terms:
        return [0] * len(jobs), [[] for _ in jobs]

    documents = _build_bm25_documents(jobs, language)
    if not any(documents):
        return [0] * len(jobs), [[] for _ in jobs]

    bm25 = BM25Okapi(documents)

    weighted_terms: list[str] = []
    for term, weight in query_terms.items():
        repeats = min(4, max(1, int(round(1 + math.log1p(weight)))))
        weighted_terms.extend([term] * repeats)

    if not weighted_terms:
        return [0] * len(jobs), [[] for _ in jobs]

    raw_scores = bm25.get_scores(weighted_terms)
    matched_terms_per_job: list[list[str]] = []
    ranked_query_terms = [term for term, _ in query_terms.most_common()]
    for doc in documents:
        present = set(doc)
        matched = [term for term in ranked_query_terms if term in present]
        matched_terms_per_job.append(matched[:6])

    score_count = len(raw_scores)
    max_score = max(raw_scores) if score_count else 0.0
    if max_score <= 0:
        return [0] * len(jobs), matched_terms_per_job

    normalized = [int(round((float(score) / max_score) * 100)) for score in raw_scores]
    return normalized, matched_terms_per_job


def _compute_rank_map(scores: list[int | None], descending: bool = True) -> dict[int, int]:
    entries = [(idx, score) for idx, score in enumerate(scores) if score is not None]
    entries.sort(key=lambda item: item[1], reverse=descending)
    return {idx: rank for rank, (idx, _) in enumerate(entries, start=1)}


def _normalize_hybrid_scores(scores: list[float]) -> list[int]:
    if not scores:
        return []
    max_score = max(scores)
    if max_score <= 0:
        return [0] * len(scores)
    return [int(round((score / max_score) * 100)) for score in scores]


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

    data = _extract_json_payload(text)
    if data is None:
        payload = text.strip()
        start = payload.find("[")
        end = payload.rfind("]")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(payload[start : end + 1])
            except json.JSONDecodeError:
                data = None

    if isinstance(data, dict):
        if isinstance(data.get("results"), list):
            data = data.get("results")
        elif isinstance(data.get("items"), list):
            data = data.get("items")
        elif isinstance(data.get("jobs"), list):
            data = data.get("jobs")
        else:
            data = [data]

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
    lm_timeout: float | None,
    enable_rerank: bool,
    rerank_top_n: int | None,
    weight_embedding: float,
    weight_keyword: float,
    query_context_text: str | None = None,
    translation_model: str | None = None,
    bm25_query_terms_override: dict[str, int] | Counter | None = None,
    bm25_query_override: str | None = None,
    bm25_language_override: str | None = None,
    bm25_tokenizer_override: str | None = None,
) -> tuple[list[dict], bool, int | None, str | None, str | None, str, str]:
    weight_total = weight_embedding + weight_keyword
    if weight_total <= 0:
        weight_embedding = 0.8
        weight_keyword = 0.2
        weight_total = 1.0
    weight_embedding = weight_embedding / weight_total
    weight_keyword = weight_keyword / weight_total

    if bm25_query_terms_override is not None:
        bm25_query_terms = Counter(bm25_query_terms_override)
        bm25_query = bm25_query_override
        bm25_language = bm25_language_override or _detect_query_language(f"{resume_text}\n{wishes or ''}")
        bm25_tokenizer = bm25_tokenizer_override or _resolve_tokenizer_mode(bm25_language)
    else:
        bm25_query, bm25_query_terms, bm25_language, bm25_tokenizer = build_query_debug(
            resume_text=resume_text,
            wishes=wishes,
            query_context_text=query_context_text,
            model=translation_model,
            lm_timeout=lm_timeout,
        )

    bm25_scores, bm25_matches = _bm25_scores(jobs, bm25_query_terms, bm25_language)

    semantic_query_text = "\n".join(
        part.strip()
        for part in [resume_text, wishes or "", query_context_text or ""]
        if part and part.strip()
    )

    embedding_scores: list[int | None] = [None] * len(jobs)
    if semantic_query_text.strip() and jobs:
        texts = [_truncate(semantic_query_text, 3000)]
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

    bm25_rank_map = _compute_rank_map(bm25_scores)
    embedding_rank_map = _compute_rank_map(embedding_scores)

    rrf_k = 60.0
    hybrid_raw_scores: list[float] = []
    for idx in range(len(jobs)):
        bm25_rank = bm25_rank_map.get(idx)
        embedding_rank = embedding_rank_map.get(idx)
        fused = 0.0
        if bm25_rank is not None:
            fused += weight_keyword * (1.0 / (rrf_k + bm25_rank))
        if embedding_rank is not None:
            fused += weight_embedding * (1.0 / (rrf_k + embedding_rank))
        hybrid_raw_scores.append(fused)

    hybrid_scores = _normalize_hybrid_scores(hybrid_raw_scores)

    for idx, job in enumerate(jobs):
        keyword_score = bm25_scores[idx]
        embedding_score = embedding_scores[idx]
        combined_score = hybrid_scores[idx] if hybrid_scores else keyword_score
        job["keyword_score"] = keyword_score
        job["bm25_score"] = keyword_score
        job["embedding_score"] = embedding_score
        job["bm25_rank"] = bm25_rank_map.get(idx)
        job["embedding_rank"] = embedding_rank_map.get(idx)
        job["hybrid_rrf_score"] = round(hybrid_raw_scores[idx], 6)
        job["match_score"] = combined_score
        job["match_reasons"] = bm25_matches[idx] if bm25_query_terms else []

    jobs.sort(key=lambda item: item.get("match_score", 0), reverse=True)

    rerank_applied = False
    rerank_used = None
    rerank_skip_reason = None

    if enable_rerank and not model:
        rerank_skip_reason = "No LLM model selected."
    elif enable_rerank and (not jobs):
        rerank_skip_reason = "No jobs available to rerank."
    elif enable_rerank and (not rerank_top_n or rerank_top_n <= 0):
        rerank_skip_reason = "Rerank top K resolved to 0."

    if enable_rerank and model and jobs and rerank_top_n and rerank_top_n > 0:
        top_n = min(rerank_top_n, len(jobs))
        rerank_used = top_n
        rerank_candidates = jobs[:top_n]
        messages = _build_rerank_prompt(resume_text, rerank_candidates)
        response, error = safe_request(
            chat_completion,
            model=model,
            messages=messages,
            temperature=0.1,
            max_tokens=700,
            timeout=lm_timeout,
        )
        if error:
            rerank_skip_reason = f"LLM request failed: {error}"
        elif response:
            parsed = _parse_rerank_response(response)
            if not parsed:
                rerank_skip_reason = "Rerank response was not valid JSON in the expected format."
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
                    rerank_applied = True

            if rerank_applied:
                rerank_skip_reason = None

            jobs.sort(key=lambda item: item.get("match_score", 0), reverse=True)

    if rerank_skip_reason and len(rerank_skip_reason) > 280:
        rerank_skip_reason = f"{rerank_skip_reason[:277].rstrip()}..."

    return jobs, rerank_applied, rerank_used, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer


def translate_terms_for_query(
    terms: list[str],
    *,
    source_language: str | None = None,
    model: str | None = None,
    lm_timeout: float | None = None,
) -> tuple[str, dict[str, list[str]]]:
    normalized_terms = [
        term.strip().lower().replace(" ", "_")
        for term in terms
        if isinstance(term, str) and term.strip()
    ]
    if not normalized_terms:
        return source_language or "mixed", {}

    language = source_language or _detect_query_language(" ".join(normalized_terms))
    if language not in {"en", "de", "mixed"}:
        language = "mixed"

    tokens = list(dict.fromkeys(normalized_terms))[:LLM_TRANSLATION_MAX_TERMS]
    if language in {"en", "de"}:
        return language, _llm_translate_terms(
            tokens,
            source_language=language,
            model=model,
            lm_timeout=lm_timeout,
        )

    en_map = _llm_translate_terms(tokens, source_language="en", model=model, lm_timeout=lm_timeout)
    de_map = _llm_translate_terms(tokens, source_language="de", model=model, lm_timeout=lm_timeout)
    return language, _merge_translation_maps(en_map, de_map)
