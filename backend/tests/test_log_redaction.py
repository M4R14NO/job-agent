import json
import logging

import pytest

from app.services import cv_service
from app.services.logging_utils import build_pii_safe_log_extra


def test_build_pii_safe_log_extra_omits_raw_values():
    payload = {
        "email": "alice@example.com",
        "phone": "+49-123",
        "profile_image": "secret-folder/profile.png",
        "skills": "invalid",
    }

    extra = build_pii_safe_log_extra(
        error=ValueError("broken"),
        payload=payload,
        request_id="req-123",
        profile_id="profile-a",
    )

    assert extra["request_id"] == "req-123"
    assert extra["profile_id"] == "profile-a"
    assert extra["error_class"] == "ValueError"
    assert extra["payload_type"] == "dict"
    assert extra["payload_key_count"] == 4
    assert extra["payload_keys"] == ["email", "phone", "profile_image", "skills"]
    assert extra["sensitive_keys_present"] == ["email", "phone", "profile_image"]


def test_parse_resume_validation_error_does_not_log_raw_payload(monkeypatch, caplog):
    sensitive_values = [
        "alice@example.com",
        "+49-123",
        "secret-folder/profile.png",
    ]
    payload = {
        "schema_version": cv_service.CANONICAL_SCHEMA_VERSION,
        "data": {
            "email": sensitive_values[0],
            "phone": sensitive_values[1],
            "profile_image": sensitive_values[2],
            # Invalid shape to force canonical validation failure.
            "skills": "invalid",
        },
    }

    def fake_safe_request(*args, **kwargs):
        return json.dumps(payload), None

    monkeypatch.setattr(cv_service, "safe_request", fake_safe_request)

    with caplog.at_level(logging.ERROR, logger="app.services.cv_service"):
        with pytest.raises(Exception):
            cv_service.parse_resume_to_canonical(
                resume_text="raw resume text",
                model="dummy-model",
            )

    assert "CV canonical validation failed" in caplog.text
    for value in sensitive_values:
        assert value not in caplog.text

    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.error_class
    assert record.payload_type == "dict"
    assert "canonical_payload" not in record.__dict__
