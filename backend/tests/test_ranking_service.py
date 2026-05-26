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

    jobs, rerank_applied, rerank_top_n, rerank_skip_reason = ranking_service.score_jobs(
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
    assert jobs[0].get("rerank_score") == 95
