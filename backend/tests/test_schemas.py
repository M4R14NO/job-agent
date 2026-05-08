from app.schemas.search import SearchRequest


def test_search_request_defaults_search_radius_km_to_none():
    payload = SearchRequest.model_validate({"resume_text": "resume"})

    assert payload.search_radius_km is None


def test_search_request_accepts_integer_search_radius_km():
    payload = SearchRequest.model_validate(
        {"resume_text": "resume", "search_radius_km": 50}
    )

    assert payload.search_radius_km == 50
