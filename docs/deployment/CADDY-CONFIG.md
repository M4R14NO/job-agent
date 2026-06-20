# Caddy Edge Configuration (Ticket 005)

This project uses Caddy as the canonical edge/TLS layer for staging and production.

Primary deployment path is Coolify-first. This Caddy path remains a maintained fallback strategy.

## Scope

- HTTPS termination and automatic certificate handling.
- HTTP to HTTPS redirect.
- Reverse proxy:
  - frontend at /
  - backend at /api
- Baseline security headers applied at edge.

## Deployment Modes

- Primary mode (low-ops): Coolify-managed deployment with secrets configured in Coolify.
- Fallback mode: Caddy + existing repository scripts/workflows in this project.

Both modes must use the same backend environment variable contract so switching mode does not require code changes.

## Config Files

- Caddy config: deploy/caddy/Caddyfile
- Example env: deploy/caddy/.env.example

## Required Environment Variables

- DOMAIN: public host served by Caddy.
- FRONTEND_UPSTREAM: internal frontend target (example: frontend:4173).
- BACKEND_UPSTREAM: internal backend target (example: backend:8000).

For fallback operation, keep sensitive runtime values out of repo files and inject them from a secure source (for example GitHub Environment secrets or host secret manager).

## Baseline Security Headers

The Caddy config sets these headers by default:

- Strict-Transport-Security
- X-Content-Type-Options
- Referrer-Policy
- Content-Security-Policy

CSP starts with a compatibility baseline and should be tightened after staging verification.

## Validate Before Deploy

1. Validate config syntax:

```bash
caddy validate --config deploy/caddy/Caddyfile
```

2. After deployment, validate redirect and headers:

```bash
bash scripts/validate-security-headers.sh https://your-domain.example https://your-domain.example
```

## Rollback

- Keep last known-good Caddyfile revision.
- Re-apply prior config and reload Caddy.
- Re-run validation script before reopening traffic.

## Fallback Drill

Run a periodic fallback smoke check to ensure this path stays operational if Coolify is unavailable:

1. Start fallback stack using current runbook steps.
2. Verify HTTPS redirect and edge headers.
3. Verify `/api/health` and one authenticated endpoint.
4. Record date and result in go-live ticket evidence.
