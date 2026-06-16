from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app import main


client = TestClient(main.app)
_password_hasher = PasswordHasher()


class _DummyStore:
    path = "/tmp/cv_profiles.json"

    def list_profiles(self):
        return []


def _set_auth_env(monkeypatch, *, cookie_secure="0"):
    monkeypatch.setenv("AUTH_ENABLED", "1")
    monkeypatch.setenv("AUTH_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("AUTH_ADMIN_PASSWORD_HASH", _password_hasher.hash("secret-password"))
    monkeypatch.setenv("AUTH_SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("AUTH_SESSION_MAX_AGE_SECONDS", "28800")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", cookie_secure)


def test_auth_me_requires_authentication_when_enabled(monkeypatch):
    _set_auth_env(monkeypatch)

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}


def test_login_logout_and_me_flow(monkeypatch):
    _set_auth_env(monkeypatch)

    login_response = client.post(
        "/auth/login",
        json={"username": "admin", "password": "secret-password"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == {
        "auth_enabled": True,
        "authenticated": True,
        "username": "admin",
    }

    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json() == {
        "auth_enabled": True,
        "authenticated": True,
        "username": "admin",
    }

    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {
        "auth_enabled": True,
        "authenticated": False,
        "username": None,
    }

    me_after_logout = client.get("/auth/me")
    assert me_after_logout.status_code == 401


def test_protected_cv_routes_require_authentication(monkeypatch):
    _set_auth_env(monkeypatch)
    monkeypatch.setattr(main, "get_profile_store", lambda: _DummyStore())

    unauth_response = client.get("/cv/profiles")
    assert unauth_response.status_code == 401

    login_response = client.post(
        "/auth/login",
        json={"username": "admin", "password": "secret-password"},
    )
    assert login_response.status_code == 200

    auth_response = client.get("/cv/profiles")
    assert auth_response.status_code == 200
    assert auth_response.json() == {"profiles": []}


def test_login_sets_expected_cookie_flags(monkeypatch):
    _set_auth_env(monkeypatch, cookie_secure="1")

    response = client.post(
        "/auth/login",
        json={"username": "admin", "password": "secret-password"},
    )

    assert response.status_code == 200
    set_cookie = response.headers.get("set-cookie", "")
    assert "job_agent_session=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie
    assert "SameSite=lax" in set_cookie


def test_auth_me_reports_enabled_false_when_auth_disabled(monkeypatch):
    monkeypatch.delenv("AUTH_ENABLED", raising=False)

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "auth_enabled": False,
        "authenticated": True,
        "username": None,
    }
