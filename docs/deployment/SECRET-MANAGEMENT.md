# Secret Management Runbook (Ticket 006)

This runbook defines a Coolify-first secret strategy with a maintained Caddy fallback path.

## Ownership

- Rotation owner: repository owner (solo developer)
- Session rotation mode: no grace period (existing sessions are invalidated after rotation)

## Shared Environment Contract

Sensitive runtime values:

- AUTH_ADMIN_USERNAME
- AUTH_ADMIN_PASSWORD_HASH
- AUTH_SESSION_SECRET

Deployment-sensitive values:

- DOMAIN
- CORS_ALLOW_ORIGINS
- STAGING_URL
- ALLOWED_ORIGIN

Operational non-sensitive values remain normal environment variables.

## Secret Inventory and Target Store

Primary store (Coolify secrets):

- AUTH_ADMIN_USERNAME
- AUTH_ADMIN_PASSWORD_HASH
- AUTH_SESSION_SECRET
- CORS_ALLOW_ORIGINS

Coolify/app config (non-secret, environment-specific):

- ENABLE_SCRAPING (expected production value: 0)
- AUTH_COOKIE_SECURE (expected production value: 1)
- AUTH_SESSION_MAX_AGE_SECONDS
- AUTH_LOGIN_LIMIT_PER_MINUTE
- LMSTUDIO_TIMEOUT
- CV_TMP_DIR
- CV_PROFILE_STORE
- CV_PROFILE_IMAGE_DIR
- CV_DEBUG_TEX (expected production value: 0)

Edge/deployment values:

- DOMAIN (Coolify domain or fallback Caddy env)
- STAGING_URL (GitHub Environment secret for validation workflows)
- ALLOWED_ORIGIN (GitHub Environment secret for validation workflows)

## Execution Checklist With Done Criteria

### Step 0: Scope lock

- [ ] Primary path is Coolify.
- [ ] Fallback path is Caddy/workflow-based.
- [ ] Shared env contract is documented.

Done criteria:

- Decision is documented in go-live ticket README.

### Step 1: Inventory and mapping

- [ ] Inventory table completed for backend/frontend/deploy/CI vars.
- [ ] Each variable mapped to storage target: Coolify Secret, GitHub Environment Secret, or plain env.

Done criteria:

- No unresolved inventory entries remain.

### Step 2: Remove sensitive defaults from repo config

- [ ] No committed reusable defaults for AUTH_SESSION_SECRET.
- [ ] No committed reusable default credential/password hints.
- [ ] Local example files require explicit user-generated secrets.

Done criteria:

- CI guard passes placeholder scan.

### Step 3: Backend fail-fast validation

- [ ] Startup validates required auth secrets when auth is enabled.
- [ ] Weak/malformed secrets are rejected.
- [ ] Logs do not print secret values.

Done criteria:

- Backend tests for validation behavior pass.

### Step 4: Coolify primary implementation

- [ ] Coolify secrets configured.
- [ ] Domain/TLS configured.
- [ ] Health checks and deploy triggers configured.

Done criteria:

- Fresh environment bootstrap works without committing secrets.

### Step 4a: Coolify bootstrap checklist (detailed)

- [ ] Create a Coolify project and two services: frontend and backend.
- [ ] Connect repository and branch for both services.
- [ ] Set backend start command and port (uvicorn, port 8000).
- [ ] Set frontend build/start configuration according to framework defaults.
- [ ] Configure backend environment variables using the shared contract.
- [ ] Configure sensitive backend values only as Coolify secrets.
- [ ] Configure domain and automatic TLS in Coolify.
- [ ] Configure health checks:
	- backend: /health
	- frontend: /
- [ ] Configure auto-deploy on push for selected branch.

Done criteria:

- Backend /health returns status ok over HTTPS.
- Auth endpoints respond correctly with configured secrets.
- No secret value appears in repository files or deployment logs.

### Step 4b: Coolify verification commands

Run after first successful deploy:

```bash
curl -s https://your-domain.example/api/health
curl -i -s https://your-domain.example/api/auth/me
```

Expected:

- health response includes status ok
- auth/me is reachable and returns auth status payload
- transport is HTTPS and domain is served with valid certificate

### Step 5: Fallback readiness

- [ ] Caddy fallback docs remain current.
- [ ] Fallback smoke drill executed.

Done criteria:

- Fallback path can start and serve app successfully.

### Step 6: Rotation evidence

- [ ] Rotate AUTH_SESSION_SECRET on staging.
- [ ] Verify old sessions are invalidated.
- [ ] Verify fresh login succeeds.
- [ ] Record timestamp, actor, and links.

Done criteria:

- Evidence is linked in go-live ticket docs.

### Step 7: Closure

- [ ] Ticket-006 DoD and acceptance criteria explicitly checked.

Done criteria:

- New environment bootstrap documented with no secrets in repository code.

## Rotation Procedure (Primary: Coolify)

1. Generate new secret:

```bash
openssl rand -hex 32
```

2. Update `AUTH_SESSION_SECRET` in Coolify secrets.
3. Trigger deploy/restart.
4. Verify:

```bash
curl -s https://your-domain.example/api/health
```

5. Confirm existing session is invalidated and new login succeeds.
6. Record evidence in go-live ticket README.

### Rotation evidence fields (required)

- Date (UTC)
- Actor/Owner
- Environment (staging/prod)
- Secret rotated (AUTH_SESSION_SECRET)
- Deploy reference (Coolify deployment id/link)
- Before check result (/api/health)
- After check result (/api/health)
- Old session result (expected: invalidated)
- New login result (expected: success)
- Incident notes (optional)

## Rotation Procedure (Fallback: Caddy + workflow)

1. Update secret source for fallback deployment.
2. Restart backend service using fallback runbook.
3. Re-run security validation checks.
4. Record evidence in go-live ticket README.
