import ast
from pathlib import Path

from fastapi.testclient import TestClient

from app import main


client = TestClient(main.app)


def test_cv_endpoint_redacts_runtime_error_detail(monkeypatch):
    def fake_generate_cv_pdf(**kwargs):
        raise RuntimeError("failed for alice@example.com +49 12345678 https://secret.example/path")

    monkeypatch.setattr(main, "generate_cv_pdf", fake_generate_cv_pdf)

    response = client.post(
        "/cv",
        json={
            "resume_text": "resume",
            "job_title": "Engineer",
            "job_description": "job",
            "model": "local-model",
        },
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "alice@example.com" not in detail
    assert "+49 12345678" not in detail
    assert "https://secret.example/path" not in detail
    assert "[redacted-email]" in detail
    assert "[redacted-number]" in detail
    assert "[redacted-url]" in detail


def test_parse_endpoint_redacts_runtime_error_detail(monkeypatch):
    def fake_parse_resume_to_canonical(**kwargs):
        raise RuntimeError("bad payload email=bob@example.com phone=+49 999 111")

    monkeypatch.setattr(main, "parse_resume_to_canonical", fake_parse_resume_to_canonical)

    response = client.post(
        "/cv/parse",
        json={
            "resume_text": "resume",
            "model": "local-model",
        },
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "bob@example.com" not in detail
    assert "+49 999 111" not in detail
    assert "[redacted-email]" in detail
    assert "[redacted-number]" in detail


def test_parse_endpoint_keeps_timeout_status(monkeypatch):
    def fake_parse_resume_to_canonical(**kwargs):
        raise RuntimeError("request timed out for alice@example.com")

    monkeypatch.setattr(main, "parse_resume_to_canonical", fake_parse_resume_to_canonical)

    response = client.post(
        "/cv/parse",
        json={
            "resume_text": "resume",
            "model": "local-model",
        },
    )

    assert response.status_code == 504
    detail = response.json()["detail"]
    assert "timed out" in detail
    assert "alice@example.com" not in detail
    assert "[redacted-email]" in detail


def test_main_logger_calls_require_safe_extra_guardrail():
    main_path = Path(main.__file__)
    source = main_path.read_text(encoding="utf-8")
    tree = ast.parse(source)

    logger_calls: list[ast.Call] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute):
            continue
        if func.attr not in {"debug", "info", "warning", "error", "exception", "critical"}:
            continue
        if isinstance(func.value, ast.Name) and "logger" in func.value.id.lower():
            logger_calls.append(node)

    for call in logger_calls:
        has_safe_extra = False
        for keyword in call.keywords:
            if keyword.arg != "extra" or not isinstance(keyword.value, ast.Call):
                continue
            callee = keyword.value.func
            if isinstance(callee, ast.Name) and callee.id == "build_pii_safe_log_extra":
                has_safe_extra = True
                break
        assert has_safe_extra, (
            "Logger calls in app.main must pass extra=build_pii_safe_log_extra(...) "
            "to avoid leaking raw PII in API-level logs."
        )


def test_main_forbids_logger_exception_calls():
    main_path = Path(main.__file__)
    source = main_path.read_text(encoding="utf-8")
    tree = ast.parse(source)

    exception_calls: list[ast.Call] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute):
            continue
        if func.attr != "exception":
            continue
        if isinstance(func.value, ast.Name) and "logger" in func.value.id.lower():
            exception_calls.append(node)

    assert not exception_calls, (
        "app.main must not use logger.exception(...). "
        "Use sanitized logger.error(..., extra=build_pii_safe_log_extra(...)) in service modules instead."
    )
