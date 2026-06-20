import hmac
import os
import time
from collections import defaultdict, deque

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import HTTPException, Request, Response

AUTH_ENABLED_ENV_VAR = "AUTH_ENABLED"
AUTH_ADMIN_USERNAME_ENV_VAR = "AUTH_ADMIN_USERNAME"
AUTH_ADMIN_PASSWORD_HASH_ENV_VAR = "AUTH_ADMIN_PASSWORD_HASH"
AUTH_SESSION_SECRET_ENV_VAR = "AUTH_SESSION_SECRET"
AUTH_SESSION_MAX_AGE_ENV_VAR = "AUTH_SESSION_MAX_AGE_SECONDS"
AUTH_COOKIE_SECURE_ENV_VAR = "AUTH_COOKIE_SECURE"
AUTH_LOGIN_LIMIT_PER_MINUTE_ENV_VAR = "AUTH_LOGIN_LIMIT_PER_MINUTE"

AUTH_COOKIE_NAME = "job_agent_session"
AUTH_COOKIE_SAMESITE = "lax"
AUTH_JWT_ALGORITHM = "HS256"
DEFAULT_SESSION_MAX_AGE_SECONDS = 28800
DEFAULT_LOGIN_LIMIT_PER_MINUTE = 5
MIN_SESSION_SECRET_LENGTH = 24

_DISALLOWED_SESSION_SECRETS = {
    "changeme",
    "change-me",
    "dev-session-secret-change-me",
    "password",
    "secret",
    "test-session-secret",
}

_password_hasher = PasswordHasher()
_login_attempts_by_ip: dict[str, deque[float]] = defaultdict(deque)


class AuthConfigError(RuntimeError):
    pass


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_auth_enabled() -> bool:
    return _is_truthy(os.getenv(AUTH_ENABLED_ENV_VAR, "0"))


def _session_secret() -> str:
    value = os.getenv(AUTH_SESSION_SECRET_ENV_VAR, "").strip()
    if not value:
        raise AuthConfigError(f"Missing {AUTH_SESSION_SECRET_ENV_VAR} while auth is enabled.")
    if len(value) < MIN_SESSION_SECRET_LENGTH:
        raise AuthConfigError(
            f"Invalid {AUTH_SESSION_SECRET_ENV_VAR}: must be at least {MIN_SESSION_SECRET_LENGTH} characters"
        )
    if value.lower() in _DISALLOWED_SESSION_SECRETS:
        raise AuthConfigError(
            f"Invalid {AUTH_SESSION_SECRET_ENV_VAR}: weak placeholder values are not allowed"
        )
    return value


def _session_max_age_seconds() -> int:
    raw = os.getenv(AUTH_SESSION_MAX_AGE_ENV_VAR, str(DEFAULT_SESSION_MAX_AGE_SECONDS)).strip()
    try:
        parsed = int(raw)
    except ValueError as exc:
        raise AuthConfigError(f"Invalid {AUTH_SESSION_MAX_AGE_ENV_VAR}: {raw}") from exc
    if parsed <= 0:
        raise AuthConfigError(f"Invalid {AUTH_SESSION_MAX_AGE_ENV_VAR}: must be > 0")
    return parsed


def _cookie_secure() -> bool:
    return _is_truthy(os.getenv(AUTH_COOKIE_SECURE_ENV_VAR, "0"))


def _login_limit_per_minute() -> int:
    raw = os.getenv(AUTH_LOGIN_LIMIT_PER_MINUTE_ENV_VAR, str(DEFAULT_LOGIN_LIMIT_PER_MINUTE)).strip()
    try:
        parsed = int(raw)
    except ValueError as exc:
        raise AuthConfigError(f"Invalid {AUTH_LOGIN_LIMIT_PER_MINUTE_ENV_VAR}: {raw}") from exc
    if parsed <= 0:
        raise AuthConfigError(f"Invalid {AUTH_LOGIN_LIMIT_PER_MINUTE_ENV_VAR}: must be > 0")
    return parsed


def _admin_username() -> str:
    value = os.getenv(AUTH_ADMIN_USERNAME_ENV_VAR, "").strip()
    if not value:
        raise AuthConfigError(f"Missing {AUTH_ADMIN_USERNAME_ENV_VAR} while auth is enabled.")
    return value


def _admin_password_hash() -> str:
    value = os.getenv(AUTH_ADMIN_PASSWORD_HASH_ENV_VAR, "").strip()
    if not value:
        raise AuthConfigError(f"Missing {AUTH_ADMIN_PASSWORD_HASH_ENV_VAR} while auth is enabled.")
    return value


def validate_auth_runtime_config() -> None:
    if not is_auth_enabled():
        return

    username = _admin_username()
    if len(username) < 3:
        raise AuthConfigError(
            f"Invalid {AUTH_ADMIN_USERNAME_ENV_VAR}: must be at least 3 characters"
        )

    password_hash = _admin_password_hash()
    if not password_hash.startswith("$argon2"):
        raise AuthConfigError(
            f"Invalid {AUTH_ADMIN_PASSWORD_HASH_ENV_VAR}: expected argon2 hash"
        )
    try:
        _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError as exc:
        raise AuthConfigError(
            f"Invalid {AUTH_ADMIN_PASSWORD_HASH_ENV_VAR}: malformed argon2 hash"
        ) from exc

    _session_secret()
    _session_max_age_seconds()
    _login_limit_per_minute()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"


def _assert_auth_enabled() -> None:
    if not is_auth_enabled():
        raise HTTPException(status_code=503, detail="Authentication is disabled by configuration")


def authenticate_admin_credentials(username: str, password: str) -> bool:
    _assert_auth_enabled()
    configured_username = _admin_username()
    configured_password_hash = _admin_password_hash()

    if not hmac.compare_digest(username.strip(), configured_username):
        return False

    try:
        return _password_hasher.verify(configured_password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_session_token(username: str) -> str:
    _assert_auth_enabled()
    now = int(time.time())
    return jwt.encode(
        {
            "sub": username,
            "iat": now,
            "exp": now + _session_max_age_seconds(),
        },
        _session_secret(),
        algorithm=AUTH_JWT_ALGORITHM,
    )


def verify_session_token(token: str | None) -> str | None:
    _assert_auth_enabled()
    if not token:
        return None
    try:
        payload = jwt.decode(token, _session_secret(), algorithms=[AUTH_JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    username = payload.get("sub")
    if not isinstance(username, str) or not username.strip():
        return None
    return username


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=_session_max_age_seconds(),
        httponly=True,
        secure=_cookie_secure(),
        samesite=AUTH_COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=_cookie_secure(),
        samesite=AUTH_COOKIE_SAMESITE,
        path="/",
    )


def require_authenticated_user(request: Request) -> str:
    if not is_auth_enabled():
        return "anonymous"

    token = request.cookies.get(AUTH_COOKIE_NAME)
    username = verify_session_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Authentication required")
    return username


def enforce_login_rate_limit(request: Request) -> None:
    if not is_auth_enabled():
        return

    now = time.time()
    ip = _client_ip(request)
    window = _login_attempts_by_ip[ip]
    cutoff = now - 60

    while window and window[0] < cutoff:
        window.popleft()

    if len(window) >= _login_limit_per_minute():
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")


def register_login_failure(request: Request) -> None:
    if not is_auth_enabled():
        return
    ip = _client_ip(request)
    _login_attempts_by_ip[ip].append(time.time())


def clear_login_failures(request: Request) -> None:
    if not is_auth_enabled():
        return
    ip = _client_ip(request)
    _login_attempts_by_ip.pop(ip, None)
