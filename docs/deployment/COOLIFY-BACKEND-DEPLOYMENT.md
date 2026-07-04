# Coolify Backend Deployment (FastAPI)

This runbook documents the working backend deployment setup used for staging.

## Scope

- Backend service only (`backend/`).
- Coolify app deployed from GitHub.
- Dockerfile-based build (not Nixpacks).

## 1) App configuration in Coolify

Use one backend app per environment, for example:

- `job-agent-staging-backend`
- `job-agent-prod-backend`

Recommended fields:

- Build Pack: `Dockerfile`
- Base Directory: `/backend`
- Dockerfile Location: `/Dockerfile`
- Domain (staging): `https://api-staging.<project-domain>.<tld>`
- Domain (production): `https://api.<project-domain>.<tld>`
- Exposed port: `8000`
- Healthcheck path: `/health`

Do not use generated random domains for final environments.

Domain placeholder legend:

- `staging`: deployment environment (for example `staging`, `prod`)
- `<project-domain>`: your registered base domain (for example `myproduct`)
- `<tld>`: top-level domain (for example `com`, `net`, `org`, `io`)

## 2) Environment variable policy (important)

For backend variables in Coolify:

- `Available at Runtime`: enabled
- `Available at Buildtime`: disabled
- `Is Multiline`: disabled
- `Is Literal`: disabled by default, except where explicitly required below

Reason:

- Backend reads configuration at runtime.
- Buildtime secrets increase leak risk in image/build metadata.

## 3) Required backend variables (staging example)

### Secrets

- `AUTH_ADMIN_USERNAME`
- `AUTH_ADMIN_PASSWORD_HASH`
- `AUTH_SESSION_SECRET`
- `LMSTUDIO_API_KEY`

### Non-secrets

- `AUTH_ENABLED=1`
- `AUTH_COOKIE_SECURE=1`
- `AUTH_SESSION_MAX_AGE_SECONDS=28800`
- `AUTH_LOGIN_LIMIT_PER_MINUTE=20`
- `ENABLE_SCRAPING=0`
- `CV_DEBUG_TEX=0`
- `CORS_ALLOW_ORIGINS=https://staging.<project-domain>.<tld>`
- `LMSTUDIO_BASE_URL=https://api.infercom.ai`
- `LMSTUDIO_TIMEOUT=240`
- `LMSTUDIO_EMBEDDING_MODEL=E5-Mistral-7B-Instruct`

## 4) Argon2 password hash generation

Generate hash locally from repo root:

```bash
source .venv/bin/activate
python - <<'PY'
from getpass import getpass
from argon2 import PasswordHasher

pw1 = getpass("Enter admin password: ")
pw2 = getpass("Repeat admin password: ")

if pw1 != pw2:
    raise SystemExit("Passwords do not match.")
if len(pw1) < 12:
    raise SystemExit("Use at least 12 characters.")

print("\nAUTH_ADMIN_PASSWORD_HASH=" + PasswordHasher().hash(pw1))
PY
```

## 5) Known Coolify finding: Argon2 hash interpolation

Argon2 hashes contain `$` characters. In Coolify/docker-compose interpolation, this can trigger warnings like:

- `The "argon2id" variable is not set...`
- `The "v" variable is not set...`

Working fix used in this deployment:

- Enable `Is Literal` for `AUTH_ADMIN_PASSWORD_HASH`.

This preserves the exact hash string without rewriting it.

## 6) Session secret generation

Generate locally:

```bash
openssl rand -base64 48
```

Store as `AUTH_SESSION_SECRET`.

## 7) Validation after deploy

Check backend health and auth status:

```bash
curl -s https://api-staging.<project-domain>.<tld>/health
curl -i -s https://api-staging.<project-domain>.<tld>/auth/me
curl -s https://api-staging.<project-domain>.<tld>/models
```

Expected:

- `/health` returns `{"status":"ok","scraping_enabled":false}`
- `/auth/me` returns auth status (401 if not logged in is expected)
- `/models` returns model list when Infercom key/base URL are valid

## 8) Common failure patterns

- `502 Bad Gateway` right after deploy:
  - App failed startup; check runtime logs.
  - Verify required auth vars are present and valid.
- `argon2id variable is not set` warnings:
  - `AUTH_ADMIN_PASSWORD_HASH` is being interpolated.
  - Set `Is Literal` for that variable.
- Build succeeds but container not running:
  - Check backend runtime logs and healthcheck path.

## 9) Production notes

- Use separate usernames, password hashes, API keys, and session secrets for staging vs production.
- Keep `CORS_ALLOW_ORIGINS` environment-specific.
- Keep all sensitive values in Coolify secret storage only.
