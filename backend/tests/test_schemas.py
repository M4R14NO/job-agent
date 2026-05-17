import pytest
from pydantic import ValidationError

from app.schemas.search import SearchRequest
from app.services.cv_mappers.awesomecv import CvAwesomePayload


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


def test_cv_awesome_payload_accepts_hidden_personal_fields_as_null():
    payload = CvAwesomePayload.model_validate(
        {
            "first_name": "Ada",
            "last_name": "Lovelace",
            "position": "Engineer",
            "address": None,
            "mobile": None,
            "email": None,
        }
    )

    assert payload.address is None
    assert payload.mobile is None
    assert payload.email is None
