import pytest
from pydantic import ValidationError

from app.schemas.search import SearchRequest


def test_search_request_defaults_search_radius_km_to_none():
    payload = SearchRequest.model_validate({"resume_text": "resume"})

    assert payload.search_radius_km is None


def test_search_request_accepts_integer_search_radius_km():
    payload = SearchRequest.model_validate(
        {"resume_text": "resume", "search_radius_km": 50}
    )

    assert payload.search_radius_km == 50


def test_search_request_rejects_negative_search_radius_km():
    with pytest.raises(ValidationError):
        SearchRequest.model_validate({"resume_text": "resume", "search_radius_km": -1})


def test_search_request_rejects_fractional_search_radius_km():
    with pytest.raises(ValidationError):
        SearchRequest.model_validate({"resume_text": "resume", "search_radius_km": 12.5})
