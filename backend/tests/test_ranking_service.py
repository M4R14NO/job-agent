from app.services import ranking_service


def test_parse_rerank_response_accepts_fenced_object_payload():
    text = """```json
    {
      "results": [
        {"index": 0, "score": 93, "reason": "Great fit"},
        {"index": 1, "score": 71, "reason": "Partial fit"}
      ]
    }
    ```"""

    parsed = ranking_service._parse_rerank_response(text)

    assert parsed[0]["score"] == 93
    assert parsed[0]["reason"] == "Great fit"
    assert parsed[1]["score"] == 71


def test_score_jobs_passes_lm_timeout_to_rerank(monkeypatch):
    captured = {}

    def fake_safe_request(fn, *args, **kwargs):
        if fn is ranking_service.create_embeddings:
            inputs = args[0]
            return ([[1.0] for _ in inputs], None)

        if fn is ranking_service.chat_completion:
            captured["timeout"] = kwargs.get("timeout")
            return ('[{"index":0,"score":95,"reason":"Strong fit"}]', None)

        return None, "unexpected call"

    monkeypatch.setattr(ranking_service, "safe_request", fake_safe_request)

    jobs, rerank_applied, rerank_top_n, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer = ranking_service.score_jobs(
        jobs=[
            {"title": "ML Engineer", "description": "Build ranking systems"},
            {"title": "Frontend Engineer", "description": "Build React UIs"},
        ],
        resume_text="ML engineer with ranking and NLP background",
        wishes="",
        model="test-model",
        lm_timeout=180,
        enable_rerank=True,
        rerank_top_n=1,
        weight_embedding=0.8,
        weight_keyword=0.2,
    )

    assert captured["timeout"] == 180
    assert rerank_applied is True
    assert rerank_top_n == 1
    assert rerank_skip_reason is None
    assert any(job.get("rerank_score") == 95 for job in jobs)
    assert bm25_query is not None
    assert bm25_language in {"en", "de", "mixed"}
    assert bm25_tokenizer in {"fallback", "spacy_en", "spacy_de", "spacy_mixed", "spacy_partial_fallback"}


def test_score_jobs_prepares_bm25_query_and_scores_matches():
    jobs = [
        {
            "title": "Senior Python Engineer",
            "description": "Build APIs with Python and FastAPI on AWS.",
            "company": "A",
        },
        {
            "title": "Frontend React Developer",
            "description": "Work with React and CSS.",
            "company": "B",
        },
    ]

    ranked, rerank_applied, rerank_top_n, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer = ranking_service.score_jobs(
        jobs=jobs,
        resume_text="",
        wishes="python fastapi aws backend",
        model=None,
        lm_timeout=None,
        enable_rerank=False,
        rerank_top_n=0,
        weight_embedding=0.8,
        weight_keyword=0.2,
    )

    assert rerank_applied is False
    assert rerank_top_n is None
    assert rerank_skip_reason is None
    assert bm25_query is not None
    assert bm25_language in {"en", "de", "mixed"}
    assert bm25_tokenizer in {"fallback", "spacy_en", "spacy_de", "spacy_mixed", "spacy_partial_fallback"}
    assert "python" in bm25_query
    assert ranked[0]["title"] == "Senior Python Engineer"
    assert ranked[0]["bm25_score"] >= ranked[1]["bm25_score"]
    assert ranked[0]["match_reasons"]


def test_score_jobs_returns_no_bm25_query_without_resume_or_wishes():
    jobs = [
        {"title": "Data Engineer", "description": "Build pipelines."},
    ]

    ranked, rerank_applied, rerank_top_n, rerank_skip_reason, bm25_query, bm25_language, bm25_tokenizer = ranking_service.score_jobs(
        jobs=jobs,
        resume_text="   ",
        wishes=None,
        model=None,
        lm_timeout=None,
        enable_rerank=False,
        rerank_top_n=0,
        weight_embedding=0.8,
        weight_keyword=0.2,
    )

    assert rerank_applied is False
    assert rerank_top_n is None
    assert rerank_skip_reason is None
    assert bm25_query is None
    assert bm25_language in {"en", "de", "mixed"}
    assert bm25_tokenizer in {"fallback", "spacy_en", "spacy_de", "spacy_mixed", "spacy_partial_fallback"}
    assert ranked[0]["bm25_score"] == 0
    assert ranked[0]["keyword_score"] == 0


def test_detect_query_language_supports_mixed_text():
    language = ranking_service._detect_query_language(
        "Ich suche eine Stelle as software engineer with NLP focus"
    )

    assert language == "mixed"


def test_prepare_bm25_query_keeps_technical_terms_for_mixed_language():
    query, terms, language = ranking_service._prepare_bm25_query(
        "Erfahrener Entwickler fuer KI Systeme",
        "python prompt engineering und nlp",
    )

    assert query is not None
    assert language in {"de", "mixed"}
    assert "python" in terms
    assert "nlp" in terms


def test_prepare_bm25_query_canonicalizes_llms_and_adds_phrases():
    query, terms, _ = ranking_service._prepare_bm25_query(
        "Hands-on with LLMs and Natural Language Processing in low code systems",
        "prompt engineering",
    )

    assert query is not None
    assert "llm" in terms
    assert "llms" not in terms
    assert "natural_language_processing" in terms
    assert "low_code" in terms
    assert "prompt_engineering" in terms


def test_prepare_bm25_query_deprioritizes_publication_meta_terms():
    query, terms, _ = ranking_service._prepare_bm25_query(
        "publication publication professional author",
        "python nlp",
    )

    assert query is not None
    assert "python" in terms
    assert "nlp" in terms
    boosts = {}
    for item in query.split():
        token, _, boost_text = item.partition("^")
        if token and boost_text.isdigit():
            boosts[token] = int(boost_text)

    assert boosts.get("python", 0) >= boosts.get("publication", 0)


def test_prepare_bm25_query_prefers_phrase_token_over_components():
    query, terms, _ = ranking_service._prepare_bm25_query(
        "Built low code automation and low code workflow tooling",
        "",
    )

    assert query is not None
    assert "low_code" in terms
    assert "low" not in terms
    assert "code" not in terms


def test_prepare_bm25_query_keeps_language_proficiency_only_when_requested():
    query_without_wishes, terms_without_wishes, _ = ranking_service._prepare_bm25_query(
        "Deutsch verhandlungssicher Englisch fließend Python NLP",
        "",
    )
    query_with_wishes, terms_with_wishes, _ = ranking_service._prepare_bm25_query(
        "Deutsch verhandlungssicher Englisch fließend Python NLP",
        "verhandlungssicher",
    )

    assert query_without_wishes is not None
    assert query_with_wishes is not None
    assert "python" in terms_without_wishes
    assert "python" in terms_with_wishes

    boosts_without = {}
    for item in query_without_wishes.split():
        token, _, boost_text = item.partition("^")
        if token and boost_text.isdigit():
            boosts_without[token] = int(boost_text)

    boosts_with = {}
    for item in query_with_wishes.split():
        token, _, boost_text = item.partition("^")
        if token and boost_text.isdigit():
            boosts_with[token] = int(boost_text)

    assert boosts_without.get("verhandlungssicher", 0) <= boosts_without.get("python", 0)
    assert boosts_with.get("verhandlungssicher", 0) >= boosts_without.get("verhandlungssicher", 0)


def test_prepare_bm25_query_expands_bilingual_terms_de_to_en(monkeypatch):
    def fake_safe_request(fn, *args, **kwargs):
        if fn is ranking_service.chat_completion:
            return (
                '{"translations":['
                '{"source":"prozessautomatisierung","targets":["process_automation"]},'
                '{"source":"datenwissenschaft","targets":["data_science"]}'
                ']}'
            ), None
        return None, "unexpected call"

    monkeypatch.setattr(ranking_service, "safe_request", fake_safe_request)

    query, terms, _ = ranking_service._prepare_bm25_query(
        "Erfahrung in Prozessautomatisierung und Datenwissenschaft",
        "",
        translation_model="gemma-4",
    )

    assert query is not None
    assert "prozessautomatisierung" in terms
    assert "process_automation" in terms
    assert "data_science" in terms


def test_expand_bilingual_terms_language_routing_uses_llm(monkeypatch):
    def fake_safe_request(fn, *args, **kwargs):
        if fn is ranking_service.chat_completion:
            source_lang = ""
            messages = kwargs.get("messages") or []
            if len(messages) > 1:
                source_lang = messages[1].get("content", "")
            if '"source_language": "de"' in source_lang:
                return '{"translations":[{"source":"prozessautomatisierung","targets":["process_automation"]}]}', None
            if '"source_language": "en"' in source_lang:
                return '{"translations":[{"source":"process_automation","targets":["prozessautomatisierung"]}]}', None
            return '{"translations":[]}', None
        return None, "unexpected call"

    monkeypatch.setattr(ranking_service, "safe_request", fake_safe_request)

    expanded_de = ranking_service._expand_bilingual_terms(
        ranking_service.Counter({"prozessautomatisierung": 4}),
        language="de",
        translation_model="gemma-4",
    )
    expanded_en = ranking_service._expand_bilingual_terms(
        ranking_service.Counter({"process_automation": 4}),
        language="en",
        translation_model="gemma-4",
    )

    assert expanded_de["process_automation"] > 0
    assert expanded_en["prozessautomatisierung"] > 0


def test_score_jobs_uses_query_context_text_for_profile_enrichment():
    ranked, _, _, _, bm25_query, _, _ = ranking_service.score_jobs(
        jobs=[
            {"title": "BPMN Automation Engineer", "description": "BPMN process automation with Python"},
            {"title": "Frontend Engineer", "description": "React UI development"},
        ],
        resume_text="",
        wishes="",
        model=None,
        lm_timeout=None,
        enable_rerank=False,
        rerank_top_n=0,
        weight_embedding=0.8,
        weight_keyword=0.2,
        query_context_text="BPMN Prozessautomatisierung Python",
    )

    assert bm25_query is not None
    assert "bpmn" in bm25_query.lower()
    assert ranked[0]["title"] == "BPMN Automation Engineer"
