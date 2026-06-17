# CORS Policy (Ticket 005)

Backend CORS policy is environment-driven and must not use hardcoded production origins.

## Environment Variable

- CORS_ALLOW_ORIGINS: comma-separated list of allowed browser origins.

Examples:

```bash
CORS_ALLOW_ORIGINS=https://app.example.com
CORS_ALLOW_ORIGINS=https://app.example.com,https://staging.example.com
```

## Defaults

If CORS_ALLOW_ORIGINS is not set, backend defaults to:

- http://localhost:5173

This keeps local development behavior unchanged.

## Guardrails

- Do not mix wildcard and explicit origins in the same value.
- Use explicit origins for production.
- Keep origin lists aligned between deployment env and backend env files.

## Validation

Use the validation script to test both a blocked and allowed origin:

```bash
bash scripts/validate-security-headers.sh https://your-domain.example https://app.example.com https://evil.example.com
```
