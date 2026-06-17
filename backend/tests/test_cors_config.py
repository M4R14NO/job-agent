import importlib

import pytest

from app import main as main_module


def _reload_main_module():
    return importlib.reload(main_module)


def test_default_cors_allow_origins_when_env_missing(monkeypatch):
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)

    module = _reload_main_module()

    assert module._parse_cors_allow_origins() == ["http://localhost:5173"]


def test_parses_comma_separated_cors_allow_origins(monkeypatch):
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "https://app.example.com, https://staging.example.com",
    )

    module = _reload_main_module()

    assert module._parse_cors_allow_origins() == [
        "https://app.example.com",
        "https://staging.example.com",
    ]


def test_rejects_mixed_wildcard_and_explicit_origins(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "*,https://app.example.com")

    with pytest.raises(RuntimeError, match=r"cannot mix '\*' with explicit origins"):
        _reload_main_module()
