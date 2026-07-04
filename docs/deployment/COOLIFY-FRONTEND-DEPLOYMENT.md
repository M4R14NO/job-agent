# Coolify Frontend Deployment (React/Vite via Docker + Nginx)

This runbook documents the recommended frontend deployment setup for staging and production.

## Scope

- Frontend service only (`frontend/`).
- Coolify app deployed from GitHub.
- Dockerfile-based build (multi-stage).
- Nginx serves built static assets on internal HTTP port 80.

## 1) App configuration in Coolify

Use one frontend app per environment, for example:

- `job-agent-staging-frontend`
- `job-agent-prod-frontend`

Recommended fields:

- Build Pack: `Dockerfile`
- Base Directory: `/frontend`
- Dockerfile Location: `/Dockerfile`
- Domain (staging): `https://staging.<project-domain>.<tld>`
- Domain (production): `https://<project-domain>.<tld>`
- Additional production redirect source: `https://www.<project-domain>.<tld>`
- Exposed port: `80`
- Healthcheck path: `/`

Coolify handles TLS and domain routing in primary mode.

## 2) Build variable policy

Frontend Vite variables are evaluated at build time.

Required build variable:

- `VITE_API_BASE_URL`

Values:

- Staging: `https://api-staging.<project-domain>.<tld>`
- Production: `https://api.<project-domain>.<tld>`

Recommended Coolify variable flags for `VITE_API_BASE_URL`:

- Available at Buildtime: enabled
- Available at Runtime: optional (not required by Vite output)
- Is Secret: disabled (this is not a secret)

## 3) Runtime model

- Build stage: Node installs dependencies and runs `npm run build`.
- Runtime stage: Nginx serves `/usr/share/nginx/html`.
- SPA fallback: `try_files $uri $uri/ /index.html`.
- Edge TLS/redirect remains outside the container and is handled by Coolify.

## 4) Health check setup in Coolify

Recommended values:

- Type: `HTTP`
- Port: `80`
- Path: `/`
- Expected status: `200`
- Interval: `10s`
- Timeout: `3s`
- Retries: `10-12`
- Start period (grace): `20-30s`

After saving settings, run one `Redeploy` and verify status reaches `Healthy`.

## 5) Validation after deploy

Checks:

```bash
curl -I https://staging.<project-domain>.<tld>
curl -I https://<project-domain>.<tld>
```

Browser validation:

- Frontend loads over HTTPS.
- Login succeeds.
- Model list loads in UI.
- One generation flow succeeds.
- API requests target expected backend domain for the environment.

## 6) Common failure patterns

- App loads but API calls fail:
  - `VITE_API_BASE_URL` is missing or set to wrong environment domain.
  - Rebuild/redeploy after correcting build variable.
- 404 on deep links (SPA routes):
  - Nginx fallback config missing or overridden.
- Healthy container but blank app:
  - Build failed silently or wrong build output copied.
  - Inspect deployment logs and verify `dist/` exists during build stage.

## 7) Promotion note

Because Vite injects env at build time, build staging and production frontend images separately with their own `VITE_API_BASE_URL` values.
